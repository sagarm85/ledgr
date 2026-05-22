import os, json, logging
from kafka import KafkaConsumer, KafkaProducer
from collections import defaultdict
from llm.client import match_invoice, MatchResult

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger(__name__)

BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.75"))

def make_producer():
    return KafkaProducer(
        bootstrap_servers=BROKER,
        value_serializer=lambda v: json.dumps(v).encode(),
        acks=1,
    )

def reconcile(invoice: dict, payments_by_invoice: dict) -> dict:
    invoice_id = invoice["invoice_id"]
    candidates = payments_by_invoice.get(invoice_id, [])

    # High-confidence: exact reference match
    for pay in candidates:
        if pay.get("reference") == invoice_id and pay["amount_paid"] >= invoice["amount"] * 0.99:
            return {**invoice, "status": "FULLY_PAID", "confidence": 1.0, "matched_payment_id": pay["payment_id"], "due_amount": 0.0}
        if pay.get("reference") == invoice_id and pay["amount_paid"] >= invoice["amount"] * 0.5:
            due = round(invoice["amount"] - pay["amount_paid"], 2)
            return {**invoice, "status": "PARTIALLY_PAID", "confidence": 0.9, "matched_payment_id": pay["payment_id"], "due_amount": due}

    # Low-confidence: use Ollama
    if candidates:
        result: MatchResult = match_invoice(invoice, candidates[:5])
        status = "FULLY_PAID" if result.confidence >= 0.9 else "PARTIALLY_PAID" if result.confidence >= CONFIDENCE_THRESHOLD else "ESCALATED"
        return {**invoice, "status": status, "confidence": result.confidence,
                "matched_payment_id": result.matched_payment_id, "due_amount": result.due_amount,
                "reasoning": result.reasoning}

    return {**invoice, "status": "UNPAID", "confidence": 0.0, "matched_payment_id": None, "due_amount": invoice["amount"]}

def run():
    producer = make_producer()
    payments_by_invoice: dict = defaultdict(list)
    invoice_buffer: list = []

    consumer = KafkaConsumer(
        "invoices-raw", "payments-raw",
        bootstrap_servers=BROKER,
        value_deserializer=lambda b: json.loads(b.decode()),
        group_id="reconciliation-job",
        auto_offset_reset="earliest",
        enable_auto_commit=True,
    )

    log.info("Reconciliation job started")
    for msg in consumer:
        data = msg.value
        topic = msg.topic

        if topic == "payments-raw":
            inv_id = data.get("invoice_id") or data.get("reference")
            if inv_id:
                payments_by_invoice[inv_id].append(data)
        elif topic == "invoices-raw":
            invoice_buffer.append(data)
            if len(invoice_buffer) >= 100:
                for inv in invoice_buffer:
                    result = reconcile(inv, payments_by_invoice)
                    producer.send("reconciled-invoices", value=result)
                producer.flush()
                log.info(f"Reconciled {len(invoice_buffer)} invoices")
                invoice_buffer.clear()

if __name__ == "__main__":
    run()
