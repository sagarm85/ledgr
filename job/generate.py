# job/generate.py
# python job/generate.py --tenant-id ACME --invoices 1000000 --payments 800000

import argparse, json, random, time, os
from datetime import datetime, timedelta, date
from faker import Faker
from kafka import KafkaProducer

fake = Faker()

def make_producer():
    return KafkaProducer(
        bootstrap_servers=os.getenv("KAFKA_BROKER", "localhost:9092"),
        value_serializer=lambda v: json.dumps(v).encode(),
        batch_size=65536,
        linger_ms=50,
        compression_type="gzip",
        acks=1,
    )

def _make_invoice(tenant_id: str, i: int) -> dict:
    d = fake.date_between(start_date=date(2025, 1, 1), end_date=date.today())
    return {
        "invoice_id":   f"{tenant_id}-INV-{i+1:010d}",
        "tenant_id":    tenant_id,
        "merchant":     fake.company(),
        "customer":     fake.company(),
        "amount":       round(random.uniform(100, 50000), 2),
        "invoice_date": d.isoformat(),
        "due_date":     (d + timedelta(days=random.choice([15, 30, 45]))).isoformat(),
        "status":       "UNPAID",
        "source":       "job",
    }

def _make_payment(tenant_id: str, i: int, inv: dict) -> dict:
    d = datetime.fromisoformat(inv["invoice_date"])
    return {
        "payment_id":   f"{tenant_id}-PAY-{i+1:010d}",
        "tenant_id":    tenant_id,
        "invoice_id":   inv["invoice_id"],
        "amount_paid":  inv["amount"] if random.random() > 0.3
                        else round(inv["amount"] * random.uniform(0.4, 0.9), 2),
        "payment_date": (d + timedelta(days=random.randint(5, 30))).isoformat(),
        "method":       random.choice(["BANK_TRANSFER", "CREDIT_CARD", "ACH"]),
        "reference":    inv["invoice_id"],
        "source":       "job",
    }

def run(tenant_id: str, n_invoices: int, n_payments: int, batch_size: int,
        payments_first: bool = False):
    producer = make_producer()
    start    = time.time()

    # Build invoice list in memory (needed to generate linked payments)
    print(f"Building {n_invoices:,} invoices in memory …")
    invoices = [_make_invoice(tenant_id, i) for i in range(n_invoices)]
    targets  = random.sample(invoices, min(n_payments, len(invoices)))
    print(f"  Ready — {len(invoices):,} invoices, {len(targets):,} payments")

    if payments_first:
        # ── Phase 1: payments ────────────────────────────────────────────────
        # Push payments to Kafka FIRST so the reconciliation buffer is full
        # when invoices start arriving → much higher first-pass match rate.
        print(f"Sending {len(targets):,} payments first …")
        start = time.time()
        for i, inv in enumerate(targets):
            producer.send("payments-raw", value=_make_payment(tenant_id, i, inv))
            if (i + 1) % batch_size == 0:
                producer.flush()
                print(f"  payments {i+1:,}/{len(targets):,}  ({(i+1)/(time.time()-start):.0f} rec/s)")
        producer.flush()
        print(f"✓ Payments done in {time.time()-start:.1f}s")

        # ── Phase 2: invoices ────────────────────────────────────────────────
        print(f"Sending {n_invoices:,} invoices …")
        start = time.time()
        for i, inv in enumerate(invoices):
            producer.send("invoices-raw", value=inv)
            if (i + 1) % batch_size == 0:
                producer.flush()
                print(f"  invoices {i+1:,}/{n_invoices:,}  ({(i+1)/(time.time()-start):.0f} rec/s)")
        producer.flush()
        print(f"✓ Invoices done in {time.time()-start:.1f}s")

    else:
        # ── Default: invoices then payments (original order) ─────────────────
        print(f"Sending {n_invoices:,} invoices …")
        start = time.time()
        for i, inv in enumerate(invoices):
            producer.send("invoices-raw", value=inv)
            if (i + 1) % batch_size == 0:
                producer.flush()
                print(f"  {i+1:,}/{n_invoices:,}  ({(i+1)/(time.time()-start):.0f} rec/s)")
        producer.flush()
        print(f"✓ Invoices done in {time.time()-start:.1f}s")

        print(f"Sending {len(targets):,} payments …")
        start = time.time()
        for i, inv in enumerate(targets):
            producer.send("payments-raw", value=_make_payment(tenant_id, i, inv))
            if (i + 1) % batch_size == 0:
                producer.flush()
                print(f"  {i+1:,}/{len(targets):,}  ({(i+1)/(time.time()-start):.0f} rec/s)")
        producer.flush()
        print(f"✓ Payments done in {time.time()-start:.1f}s")

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Ledgr data generator")
    p.add_argument("--tenant-id",      default="DEMO")
    p.add_argument("--invoices",       type=int, default=10_000)
    p.add_argument("--payments",       type=int, default=8_000)
    p.add_argument("--batch-size",     type=int, default=5_000)
    p.add_argument("--payments-first", action="store_true",
                   help="Push payments to Kafka before invoices for higher first-pass match rate")
    a = p.parse_args()
    run(a.tenant_id, a.invoices, a.payments, a.batch_size, a.payments_first)
