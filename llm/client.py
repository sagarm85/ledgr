import ollama, os, logging
from pydantic import BaseModel
from typing import Optional

log = logging.getLogger(__name__)

MODEL = os.getenv("OLLAMA_MODEL", "mistral")
HOST  = os.getenv("OLLAMA_HOST", "http://localhost:11434")

class MatchResult(BaseModel):
    matched_payment_id: Optional[str] = None
    match_type: str        # exact | partial | none
    confidence: float      # 0.0 - 1.0
    due_amount: float
    reasoning: str

VALID_STATUSES = {"FULLY_PAID", "PARTIALLY_PAID", "UNPAID", "ESCALATED"}

class QueryFilters(BaseModel):
    status: list[str] = []
    invoice_id_hint: str = ""    # exact invoice_id if user typed one, else ""
    min_amount: float = 0.0      # 0.0 = no lower bound
    max_amount: float = 0.0      # 0.0 = no upper bound
    date_from: str = ""          # "" = no start date
    date_to: str = ""            # "" = no end date
    customer_keywords: list[str] = []
    merchant_keywords: list[str] = []
    meaning: str = ""

    def clean_status(self) -> list[str]:
        """Drop any status values Ollama hallucinated (non-status strings)."""
        return [s for s in self.status if s in VALID_STATUSES]

def _chat(prompt: str, schema: type[BaseModel]) -> str:
    client = ollama.Client(host=HOST)
    response = client.chat(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        format=schema.model_json_schema(),
    )
    # ollama 0.1.x returns a dict; 0.3.x+ returns an object
    if isinstance(response, dict):
        return response["message"]["content"]
    return response.message.content

class PaymentQueryFilters(BaseModel):
    payment_id_hint: str = ""
    invoice_id_hint: str = ""
    method: list[str] = []          # BANK_TRANSFER | CREDIT_CARD | ACH
    min_amount: float = 0.0
    max_amount: float = 0.0
    date_from: str = ""
    date_to: str = ""
    meaning: str = ""

VALID_METHODS = {"BANK_TRANSFER", "CREDIT_CARD", "ACH"}

def parse_payment_query(user_query: str) -> PaymentQueryFilters:
    prompt = f"""Convert this payment search query into structured filter fields.

Query: "{user_query}"

Rules:
- payment_id_hint: exact payment ID if present (e.g. TEST-PAY-F001), else empty string.
- invoice_id_hint: exact invoice ID if present (e.g. TEST-INV-E001), else empty string.
- method: list from [BANK_TRANSFER, CREDIT_CARD, ACH] only. Empty list = all methods.
- min_amount: minimum amount paid in dollars, or 0.0 if no lower bound.
- max_amount: maximum amount paid in dollars, or 0.0 if no upper bound.
- date_from: start payment date as YYYY-MM-DD, or empty string.
- date_to: end payment date as YYYY-MM-DD, or empty string.
- meaning: one-sentence summary of what the user is looking for.
"""
    filters = PaymentQueryFilters.model_validate_json(_chat(prompt, PaymentQueryFilters))
    filters.method = [m for m in filters.method if m in VALID_METHODS]
    log.info(
        "Ollama parsed payment query | input=%r payment_id=%r invoice_id=%r "
        "method=%s amount=[%.2f,%.2f] date=[%s,%s] meaning=%r",
        user_query, filters.payment_id_hint, filters.invoice_id_hint,
        filters.method or "all", filters.min_amount, filters.max_amount,
        filters.date_from or "*", filters.date_to or "*", filters.meaning,
    )
    return filters


def match_invoice(invoice: dict, candidates: list[dict]) -> MatchResult:
    prompt = f"""You are an expert accountant.
Match this invoice to the best payment from the candidates.

INVOICE: {invoice}
CANDIDATE PAYMENTS: {candidates}

Rules:
- Payment reference mentioning invoice ID is a strong signal
- Amount can be partial (50%+ of invoice = likely match)
- Payment must be after invoice date
- Set confidence 0.0-1.0
- If no match, set matched_payment_id to null
"""
    return MatchResult.model_validate_json(_chat(prompt, MatchResult))

def parse_query(user_query: str) -> QueryFilters:
    prompt = f"""Convert this search query into structured filter fields.

Query: "{user_query}"

Rules:
- invoice_id_hint: if the query contains an invoice ID (pattern like XXXX-INV-NNNN or similar code), put it here exactly. Otherwise empty string.
- status: list from [FULLY_PAID, PARTIALLY_PAID, UNPAID, ESCALATED] only. Empty list = all. NEVER put invoice IDs or other values here.
- min_amount: minimum invoice amount in dollars, or 0.0 if no lower bound.
- max_amount: maximum invoice amount in dollars, or 0.0 if no upper bound.
- date_from: start date as YYYY-MM-DD, or empty string.
- date_to: end date as YYYY-MM-DD, or empty string.
- customer_keywords: customer name words to match, or empty list.
- merchant_keywords: merchant/vendor name words to match, or empty list.
- meaning: one-sentence summary of what the user is looking for.
"""
    filters = QueryFilters.model_validate_json(_chat(prompt, QueryFilters))
    log.info(
        "Ollama parsed query | input=%r invoice_id=%r status=%s min=%.2f max=%.2f "
        "date=[%s,%s] customer=%s merchant=%s meaning=%r",
        user_query, filters.invoice_id_hint, filters.clean_status(),
        filters.min_amount, filters.max_amount,
        filters.date_from or "*", filters.date_to or "*",
        filters.customer_keywords, filters.merchant_keywords, filters.meaning,
    )
    return filters
