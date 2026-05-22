from pydantic import BaseModel
from typing import Optional, List
from datetime import date

class InvoiceRecord(BaseModel):
    invoice_id: str
    tenant_id: str
    merchant: str
    customer: str
    amount: float
    invoice_date: str
    due_date: str
    status: str
    confidence: Optional[float] = 0.0
    matched_payment_id: Optional[str] = None
    due_amount: Optional[float] = None
    reasoning: Optional[str] = None
    source: Optional[str] = "job"

class SearchRequest(BaseModel):
    query: str
    tenant_id: str
    page: int = 1
    size: int = 50

class SearchResponse(BaseModel):
    total: int
    invoices: List[InvoiceRecord]
    query_parsed: Optional[dict] = None

class AnalyticsResponse(BaseModel):
    total_invoices: int
    total_due: float
    match_rate: float
    escalated_rate: float
    status_breakdown: dict
    daily_volumes: List[dict]
    daily_payment_volumes: List[dict] = []
    tenant_id: str

class PaymentRecord(BaseModel):
    payment_id: str
    tenant_id: str
    invoice_id: str
    amount_paid: float
    payment_date: str
    method: str
    reference: str = ""
    source: str = "job"
    raw_kafka_payload: Optional[dict] = None
    candidate_note: Optional[str] = None

class ManualReconcileRequest(BaseModel):
    invoice_id: str
    payment_id: str
    status: str           # FULLY_PAID | PARTIALLY_PAID
    due_amount: float = 0.0
    note: str = ""

class ManualReconcileResponse(BaseModel):
    invoice_id: str
    payment_id: str
    status: str
    updated: bool

class LLMEvent(BaseModel):
    invoice_id: str
    tenant_id: str
    started_at: str
    completed_at: Optional[str] = None
    duration_ms: Optional[int] = None
    candidates: int = 0
    outcome: Optional[str] = None        # FULLY_PAID | PARTIALLY_PAID | ESCALATED | UNPAID
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    status: str                           # queued | processing | done | failed

class LLMQueueResponse(BaseModel):
    queued: int
    active: int
    completed: int
    escalated: int
    avg_duration_ms: Optional[float] = None
    active_records: List[LLMEvent]
    recent_completed: List[LLMEvent]

class ReconciliationRecord(BaseModel):
    invoice_id: str
    tenant_id: str
    merchant: str
    customer: str
    amount: float
    invoice_date: str
    due_date: str
    status: str
    confidence: float = 0.0
    matched_payment_id: Optional[str] = None
    due_amount: float = 0.0
    reasoning: Optional[str] = None
    payment_amount_paid: Optional[float] = None
    payment_date: Optional[str] = None
    payment_method: Optional[str] = None

class ReconciliationResponse(BaseModel):
    total: int
    records: List[ReconciliationRecord]

class GenerateRequest(BaseModel):
    tenant_id: str = "DEMO"
    invoices: int = 10000
    payments: int = 8000
    batch_size: int = 5000

class HealthResponse(BaseModel):
    status: str
    services: dict
