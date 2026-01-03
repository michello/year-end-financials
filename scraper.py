import csv
import os
from enum import Enum
"""
spreadsheet format is:
Source, Purchase Date, Item, Amount, Category

spreadsheet categories are:
* Bills
* Subscriptions
* Entertainment
* Food & Drink
* Groceries
* Health & Wellbeing
* Other
* Shopping
* Transport
* Travel
* Investments
"""

BASE_DIR = os.path.dirname(__file__)
OUTPUT_PATH = os.path.join(BASE_DIR, "./data/2025-compiled-card-spending.csv")

class CardType(Enum):
    AMEX = 1
    CAPITAL_ONE = 2
    CHASE = 3
    CHASE_BUSINESS = 4
    DISCOVER = 5
    OLD_NAVY = 6

INPUT_FILES = [
    ("2025-amex-gold-card.csv", "Amex - Gold", CardType.AMEX),
    ("2025-amex-blue-cash-everyday-card.csv", "Amex - Blue Cash", CardType.AMEX),
    ("2025-capital1-quicksilver-card.csv", "Capital One - Quick Silver", CardType.CAPITAL_ONE),
    ("2025-capital1-venture-rewards-card.csv", "Capital One - Venture Rewards", CardType.CAPITAL_ONE),
    ("2025-chase-freedom-flex-card.csv", "Chase - Freedom Flex", CardType.CHASE),
    ("2025-chase-ink-preferred-card.csv", "Chase - Ink Preferred", CardType.CHASE_BUSINESS),
    ("2025-chase-sapphire-preferred-card.csv", "Chase - Sapphire Preferred", CardType.CHASE),
    ("2025-discover-card.csv", "Discover", CardType.DISCOVER),
    ("2025-old-navy-card.csv", "Old Navy", CardType.OLD_NAVY)
]

SUBSCRIPTION_NAMES = {"GOOGLE ONE","PLANET FITNESS","CHATGPT", "FACTOR", "FACTOR75", "CYCLEBAR","HYPERBEAM_WP_BASE", "CRUNCHYROLL", "NETFLIX  INC.","NETFLIX.COM", "HELLOINTERVIEW", "CARDPOINTERS.COM"}
BILLS = {"TMOBILE*AUTO PAY"}
TRANSPORT = {"LYFT"}

SPREADSHEET_CATEGORIES = {
    "Bills", "Subscriptions", "Entertainment", "Food & Drink", "Groceries", "Health & Wellbeing", "Shopping", "Transport", "Travel", "Investments" }


def is_payment(raw_item, raw_category):
    return (("Payment" in raw_item or "ONLINE PAYMENT" in raw_item or "ONLINE PYMT" in raw_item or "Payment" in raw_item)
             or ("PAYMENT" in raw_category or "Payment" in raw_category))

def process_category(raw_item, raw_category: str):
    if raw_item == "HEYTEA-NY Brooklyn86st":
        print(f"{raw_item} {raw_category}")
    if raw_item in SUBSCRIPTION_NAMES: return "Subscriptions"
    if "MTA" in raw_item: return "Transport"
    if "LYFT" in raw_item: return "Transport"
    if "OMNY" in raw_item: return "Transport"

    if raw_item in BILLS: return "Bills"

    lower_case = raw_category.lower().capitalize()

    if lower_case == "Business services-professional services":
        return "Travel"
    if "Transportation" in lower_case: return "Transport"
    if "Travel" in lower_case: return "Travel"
    if "Lodging" in lower_case: return "Travel"
    if "Entertainment" in lower_case: return "Entertainment"
    if "pharmacies" in lower_case or "Health Care" in lower_case: 
        return "Health & Wellbeing"
    if "groceries" in lower_case: return "Groceries"
    if "wholesale stores" in lower_case: return "Groceries"
    if "Restaurant" in lower_case: return "Food & Drink"
    if "Dining" in lower_case: return "Food & Drink"
    if "Merchandise" in lower_case: return "Shopping"
    if "Redeem Cash Back at Amazon.com Credit" in lower_case: return "Shopping"
    if "BILL" in lower_case: return "Bills"
    if "AMTRAK" in lower_case: return "Travel"

    return raw_category if raw_category in SPREADSHEET_CATEGORIES else "Other"

def process_raw_amount(raw_amount):
    return -(float(raw_amount))

class CreditCardHeader:
    def __init__(self, raw_date_index, raw_category_index, raw_item_index, raw_amount_index, spender_index = None, credit_index = None):
        self.raw_date_index = raw_date_index
        self.raw_category_index = raw_category_index
        self.raw_item_index = raw_item_index
        self.raw_amount_index = raw_amount_index
        self.spender_index = spender_index
        self.debit_index = raw_amount_index
        self.credit_index = None
    
CARD_TO_HEADER_INDEX = {
    CardType.AMEX: CreditCardHeader(
        raw_date_index = 0,
        raw_category_index = 12,
        raw_item_index = 1,
        raw_amount_index = 4,
        spender_index = 2,
        credit_index = 4
    ),
    CardType.CAPITAL_ONE: CreditCardHeader(
        raw_date_index = 0, 
        raw_category_index = 4, 
        raw_item_index = 3, 
        raw_amount_index = 5,
        spender_index = None,
        credit_index = 6),
    CardType.CHASE: CreditCardHeader(
        raw_date_index = 0, 
        raw_category_index = 3, 
        raw_item_index = 2, 
        raw_amount_index = 5,
        spender_index = None,
        credit_index = 5),
    CardType.CHASE_BUSINESS: CreditCardHeader(
        raw_date_index = 1,
        raw_category_index = 5,
        raw_item_index = 3,
        raw_amount_index = 6,
        spender_index = None,
        credit_index = 6
    ),
    CardType.DISCOVER: CreditCardHeader(
        raw_date_index = 0,
        raw_category_index = 4,
        raw_item_index = 2,
        raw_amount_index = 3,
        spender_index = None,
        credit_index = 3
    ),
    CardType.OLD_NAVY: CreditCardHeader(
        raw_date_index = 0,
        raw_category_index = None,
        raw_item_index = 1,
        raw_amount_index = 3,
        spender_index = None,
        credit_index = 3
    )
}

def scrape():
    for filename, SOURCE, CARD_TYPE in INPUT_FILES:

        input_path = os.path.join(BASE_DIR, "./data", filename)

        # category indices
        credit_card_header = CARD_TO_HEADER_INDEX[CARD_TYPE]
        raw_date_index = credit_card_header.raw_date_index
        raw_category_index = credit_card_header.raw_category_index
        raw_item_index = credit_card_header.raw_item_index
        raw_debit_index = credit_card_header.raw_amount_index
        raw_credit_index = credit_card_header.credit_index
        raw_spender_index = credit_card_header.spender_index

        with open(input_path, newline="\n") as input_file:

            reader = csv.reader(input_file)
            next(reader)

            with open(OUTPUT_PATH, "a", newline="\n", encoding="utf-8") as output_file:
        
                writer = csv.writer(output_file)

                for row in reader:
                    raw_date = row[raw_date_index]
                    spender = row[raw_spender_index] if raw_spender_index else "MICHELLE LAM"
                    raw_category = row[raw_category_index] if raw_category_index else ""
                    raw_item = row[raw_item_index]
                    raw_amount = row[raw_debit_index] if raw_debit_index else row[raw_credit_index]

                    if is_payment(raw_item, raw_category): continue

                    amount = process_raw_amount(raw_amount) if CARD_TYPE in {CardType.CHASE, CardType.CHASE_BUSINESS, CardType.OLD_NAVY} else raw_amount

                    processed_category = "Shopping" if CARD_TYPE == CardType.OLD_NAVY else process_category(raw_item, raw_category)
                    print(processed_category)
                    new_row = [SOURCE, raw_date, raw_item, amount, processed_category, spender]

                    writer.writerow(new_row)

scrape()
