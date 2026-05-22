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

def run(tenant_id: str, n_invoices: int, n_payments: int, batch_size: int):
    producer = make_producer()
    invoices = []
    start = time.time()

    print(f"Generating {n_invoices:,} invoices → tenant: {tenant_id}")
    for i in range(n_invoices):
        d = fake.date_between(start_date=date(2025, 1, 1), end_date=date.today())
        inv = {
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
        invoices.append(inv)
        producer.send("invoices-raw", value=inv)
        if (i + 1) % batch_size == 0:
            producer.flush()
            rate = (i + 1) / (time.time() - start)
            print(f"  {i+1:,}/{n_invoices:,}  ({rate:.0f} rec/s)")

    producer.flush()
    print(f"✓ Invoices done in {time.time()-start:.1f}s")

    print(f"Generating {n_payments:,} payments → tenant: {tenant_id}")
    start = time.time()
    targets = random.sample(invoices, min(n_payments, len(invoices)))

    for i, inv in enumerate(targets):
        d = datetime.fromisoformat(inv["invoice_date"])
        pay = {
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
        producer.send("payments-raw", value=pay)
        if (i + 1) % batch_size == 0:
            producer.flush()
            rate = (i + 1) / (time.time() - start)
            print(f"  {i+1:,}/{n_payments:,}  ({rate:.0f} rec/s)")

    producer.flush()
    print(f"✓ Payments done in {time.time()-start:.1f}s")

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Ledgr data generator")
    p.add_argument("--tenant-id",  default="DEMO")
    p.add_argument("--invoices",   type=int, default=10_000)
    p.add_argument("--payments",   type=int, default=8_000)
    p.add_argument("--batch-size", type=int, default=5_000)
    a = p.parse_args()
    run(a.tenant_id, a.invoices, a.payments, a.batch_size)
