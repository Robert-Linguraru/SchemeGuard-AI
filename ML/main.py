from collections import defaultdict
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="SchemeGuard ML Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "ml"
    }


class Transaction(BaseModel):
    id: str
    externalId: str
    scheme: str | None = None
    amount: float | None = None
    currency: str | None = None
    cardType: str | None = None
    cardCategory: str | None = None
    channel: str | None = None
    issuerCountry: str | None = None
    merchantCountry: str | None = None
    threeDsUsed: bool | None = None
    cvvPresent: bool | None = None
    merchantDataComplete: bool | None = None
    clearingDelayDays: float | None = None
    qualificationStatus: str | None = None
    qualificationCategory: str | None = None
    ruleCode: str | None = None
    interchangeRate: float


class DetectOutliersRequest(BaseModel):
    transactions: list[Transaction]


def peer_key(transaction: Transaction) -> tuple[object, ...]:
    """Group only transactions whose rate should be comparable.

    Qualification/rule context is essential: a valid qualified rate must not
    be compared with a valid fallback rate just because their card attributes
    look similar.
    """
    return (
        transaction.scheme,
        transaction.currency,
        transaction.cardType,
        transaction.cardCategory,
        transaction.channel,
        transaction.threeDsUsed,
        transaction.cvvPresent,
        transaction.merchantCountry,
        transaction.qualificationStatus,
        transaction.qualificationCategory,
        transaction.ruleCode,
    )


def rate_outliers(transactions: list[Transaction], indexes: list[int]) -> set[str]:
    if len(indexes) < 4:
        return set()
    rates = sorted(transactions[index].interchangeRate for index in indexes)
    q1 = rates[(len(rates) - 1) // 4]
    q3 = rates[(len(rates) - 1) * 3 // 4]
    iqr = q3 - q1
    if iqr == 0:
        median = rates[len(rates) // 2]
        if all(rate == median for rate in rates):
            return set()
        # A rule normally produces one fixed rate. Only mark the minority
        # value; never mark every member of a valid minority rule group.
        counts = {rate: rates.count(rate) for rate in set(rates)}
        majority_rate = max(counts, key=counts.get)
        if counts[majority_rate] < 2 or counts[majority_rate] <= len(rates) / 2:
            return set()
        return {
            transactions[index].id
            for index in indexes
            if transactions[index].interchangeRate != majority_rate
        }
    else:
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return {
        transactions[index].id for index in indexes
        if transactions[index].interchangeRate < lower
        or transactions[index].interchangeRate > upper
    }


@app.post("/detect-outliers")
def detect_outliers(payload: DetectOutliersRequest) -> dict[str, list[str]]:
    outliers: set[str] = set()
    peers: dict[tuple[object, ...], list[int]] = defaultdict(list)
    for index, transaction in enumerate(payload.transactions):
        peers[peer_key(transaction)].append(index)

        # These are operational anomalies even when the fallback rate itself
        # is valid: incomplete merchant data and a late clearing indicate that
        # the transaction did not receive the expected qualification path.
        if (
            transaction.qualificationStatus == "NOT_QUALIFIED"
            and transaction.merchantDataComplete is False
            and transaction.clearingDelayDays is not None
            and transaction.clearingDelayDays > 2.0
        ):
            outliers.add(transaction.id)

    for indexes in peers.values():
        outliers.update(rate_outliers(payload.transactions, indexes))
    return {"outlierTransactionIds": sorted(outliers)}
