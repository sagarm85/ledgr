from datetime import date as _date, timedelta
from typing import Optional


def _fuzzy_score(invoice: dict, pay: dict) -> int:
    score = 0
    inv_id = invoice.get("invoice_id", "").lower()
    ref    = (pay.get("reference") or "").lower()
    amount = float(invoice.get("amount", 0))
    paid   = float(pay.get("amount_paid", 0))

    if inv_id and (inv_id in ref or inv_id[-8:] in ref or inv_id[-12:] in ref):
        score += 3

    if amount > 0:
        pct = paid / amount
        if pct >= 0.99:   score += 3
        elif pct >= 0.95: score += 2
        elif pct >= 0.50: score += 1

    try:
        inv_date = _date.fromisoformat(str(invoice.get("invoice_date", "2000-01-01")))
        due_date = _date.fromisoformat(str(invoice.get("due_date", "2000-01-01")))
        pay_date = _date.fromisoformat(str(pay.get("payment_date", "2000-01-01")))
        if inv_date <= pay_date <= due_date + timedelta(days=30):
            score += 1
    except Exception:
        pass

    return score


def fuzzy_match(invoice: dict, candidates: list) -> Optional[dict]:
    amount = float(invoice.get("amount", 0))
    best_score, best_pay = 0, None
    for pay in candidates:
        s = _fuzzy_score(invoice, pay)
        if s > best_score:
            best_score, best_pay = s, pay

    if best_score >= 5 and best_pay:
        paid   = float(best_pay.get("amount_paid", 0))
        pct    = paid / amount if amount > 0 else 0
        status = "FULLY_PAID" if pct >= 0.99 else "PARTIALLY_PAID"
        due    = max(0.0, round(amount - paid, 2))
        return {
            **invoice,
            "status":             status,
            "confidence":         round(0.7 + best_score * 0.04, 2),
            "matched_payment_id": best_pay["payment_id"],
            "due_amount":         due,
            "reasoning":          f"Fuzzy rule match (score={best_score}/7): ref+amount signals resolved without LLM.",
        }
    return None
