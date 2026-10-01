import argparse
import csv
import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal


MERCHANTS = {
    "bcaee805-891e-35e4-bed1-faf7efc7e0dc": {"merchant_country": "RO", "merchant_name": "Example electronics"},
    "419d7e56-d573-3f23-9a08-a28af936908f": {"merchant_country": "RO", "merchant_name": "Example Market"},
    "fb59177f-7334-3f2d-95fd-6af635c02d53": {"merchant_country": "US", "merchant_name": "Northwind Travel"},
    "249bec8e-4e3c-392c-a921-803be4789977": {"merchant_country": "GB", "merchant_name": "London Books"},
    "3578cf6d-06ec-37b3-a816-491fa3e55a62": {"merchant_country": "DE", "merchant_name": "Berlin Clothing"},
    "14b984e8-bb90-3be7-abc7-e769a13f3ae6": {"merchant_country": "FR", "merchant_name": "Paris Bakery"},
    "a6827952-ce6c-3929-b7f9-9d893a45d331": {"merchant_country": "IT", "merchant_name": "Roma Hotels"},
    "107a2737-0952-336d-8d73-ae5fe371a270": {"merchant_country": "ES", "merchant_name": "Madrid Pharmacy"},
    "99c107d0-d769-382a-a002-953140d68536": {"merchant_country": "US", "merchant_name": "Seattle Hardware"},
    "36a51224-6b56-38ab-8517-11de3e8da95d": {"merchant_country": "NL", "merchant_name": "Amsterdam Services"},
}

FIELDNAMES = [
    "transaction_id",
    "network",
    "amount",
    "currency",
    "merchant_country",
    "merchant_id",
    "merchant_name",
    "mcc",
    "card_country",
    "card_type",
    "card_product",
    "is_commercial_card",
    "channel",
    "entry_mode",
    "authentication",
    "authorization_timestamp",
    "clearing_timestamp",
    "authorization_code",
    "settlement_status",
    "merchant_data_complete",
    "recurring",
    "refund",
]

MCC_BY_CATEGORY = {
    "electronics": 5732,
    "market": 5411,
    "travel": 4722,
    "books": 5942,
    "clothing": 5651,
    "bakery": 5462,
    "hotel": 7011,
    "pharmacy": 5912,
    "general": 5999,
}

COUNTRIES = ["RO", "FR", "DE", "GB", "IT", "ES", "PT", "US", "NL", "BE"]
CURRENCIES = ["EUR", "RON", "USD", "GBP", "CHF"]

# The generator deliberately keeps the fields used for clustering stable for
# most rows.  This gives the detector a useful peer group instead of producing
# one almost-unique combination per transaction.
# Keep the baseline deterministic: otherwise naturally incomplete rows would
# be indistinguishable from the deliberately injected anomaly candidates.
NORMAL_MERCHANT_DATA_PROBABILITY = 1.0
NORMAL_CLEARING_DELAY_DAYS = (1, 2)
ANOMALY_CLEARING_DELAY_DAYS = 5

def amount_for_currency(currency: str) -> str:
    limits = {"EUR": (5, 800), "USD": (5, 1000), "GBP": (5, 700), "RON": (5, 1200), "CHF": (5, 700)}
    low, high = limits[currency]
    amount = Decimal(random.randint(low * 100, high * 100)) / 100
    return format(amount, "f").rstrip("0").rstrip(".")

def timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def guess_mcc(merchant_name: str) -> int:
    name = merchant_name.lower()
    for category, mcc in MCC_BY_CATEGORY.items():
        if category in name:
            return mcc
    return MCC_BY_CATEGORY["general"]

def generate_transaction(
    transaction_number: int,
    start: datetime,
    anomaly: bool = False,
) -> dict:
    merchant_id = random.choice(list(MERCHANTS))
    merchant = MERCHANTS[merchant_id]
    if anomaly:
        # Keep the clustering attributes unchanged, but move the merchant to a
        # different processing region. Combined with incomplete data and late
        # clearing below, this makes the rule engine choose a different/fallback
        # rate while leaving a meaningful peer group for the ML service.
        merchant_id = "fb59177f-7334-3f2d-95fd-6af635c02d53"
        merchant = MERCHANTS[merchant_id]
    channel = random.choices(["ecommerce", "pos"], weights=[30, 70])[0]
    network = random.choice(["VISA", "MASTERCARD"])
    card_type = random.choice(["debit", "credit", "consumer_credit"])
    currency = random.choice(CURRENCIES)
    auth_time = start + timedelta(minutes=random.randint(0, 60 * 24 * 30))
    normal_delay = random.choice(NORMAL_CLEARING_DELAY_DAYS)
    clearing_delay = ANOMALY_CLEARING_DELAY_DAYS if anomaly else normal_delay
    clearing_time = auth_time + timedelta(days=clearing_delay)
    card_not_present = channel == "ecommerce"
    merchant_data_complete = (
        False if anomaly else random.random() < NORMAL_MERCHANT_DATA_PROBABILITY
    )

    return {
        "transaction_id": f"TX-{200000 + transaction_number:06d}",
        "network": network,
        "amount": amount_for_currency(currency),
        "currency": currency,
        "merchant_country": merchant["merchant_country"],
        "merchant_id": merchant_id,
        "merchant_name": merchant["merchant_name"],
        "mcc": guess_mcc(merchant["merchant_name"]),
        "card_country": random.choice(COUNTRIES),
        "card_type": card_type,
        "card_product": random.choice(["traditional", "purchasing"]),
        "is_commercial_card": random.choice(["TRUE", "FALSE"]),
        "channel": channel,
        "entry_mode": "card_not_present" if card_not_present else random.choice(["chip", "card_not_present"]),
        "authentication": "3ds_authenticated" if card_not_present else "3ds_not_applicable",
        "authorization_timestamp": timestamp(auth_time),
        "clearing_timestamp": timestamp(clearing_time),
        "authorization_code": f"{random.choice('ABCDEFGH')}{random.randint(10000, 999999)}",
        "settlement_status": random.choice(["settled", "pending"]),
        # An anomaly is represented by a transaction that otherwise belongs to
        # a normal peer group but fails two common qualification controls:
        # incomplete merchant data and late clearing.  The CSV schema does not
        # contain an interchange-rate column; the backend calculates the rate
        # from these attributes, so this is the realistic way to create a
        # rate outlier for an end-to-end test.
        "merchant_data_complete": "TRUE" if merchant_data_complete else "FALSE",
        "recurring": "TRUE" if random.random() < 0.08 else "FALSE",
        "refund": "TRUE" if random.random() < 0.03 else "FALSE",
    }

def main() -> None:
    parser = argparse.ArgumentParser(description="")
    parser.add_argument("--rows", type=int, default=1000, help="number of rows")
    parser.add_argument("--output", default="transactions_1000.csv", help="output CSV")
    parser.add_argument("--seed", type=int, default=None, help="seed")
    parser.add_argument(
        "--anomaly-rate",
        type=float,
        default=0.02,
        help="fraction of rows to make deliberate rate-anomaly candidates (default: 0.02)",
    )

    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)
    if args.rows < 1:
        parser.error("--rows must be at least 1")
    if not 0 <= args.anomaly_rate <= 1:
        parser.error("--anomaly-rate must be between 0 and 1")

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    anomaly_count = round(args.rows * args.anomaly_rate)
    anomaly_rows = set(random.sample(range(1, args.rows + 1), anomaly_count))
    with open(args.output, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        for number in range(1, args.rows + 1):
            writer.writerow(
                generate_transaction(number, start, anomaly=number in anomaly_rows)
            )

    print(f"Generated {args.rows} transactions, including {anomaly_count} anomaly candidates.")

if __name__ == "__main__":
    main()
