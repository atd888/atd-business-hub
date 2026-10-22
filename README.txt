ATD BUSINESS HUB — LOCAL PROTOTYPE

How to open on your Mac:
1. Download and unzip ATD_Business_Hub_Prototype.zip.
2. Open the folder and double-click index.html.
3. It should open in Safari or your default browser.

Features in this prototype:
- Dashboard summary
- Customer enquiry form and locally stored photos
- Quote/invoice records, deposit calculations, balance tracking and print-to-PDF through the browser print dialog
- Job calendar
- Expense log and simple estimated profit calculation
- Before/after gallery
- Export/import JSON backup

Important limitations:
- This is a local prototype, not a live online app.
- Data stays in the current browser on this device. It does not sync across devices.
- Browser storage is not a secure database. Do not use it yet for sensitive real customer information.
- Photos are stored locally and browser storage is limited.
- No authentication, cloud database, email sending, payment processing or online booking is connected.
- Do not enter or store card details.
- Before public launch, implement server-side authentication, database access controls, private file storage, backups and a tested hosted checkout integration.


UPDATED VERSION: Company contact details have been added to the app header and printable quotes/invoices.

PAYMENT STAGES UPDATE:
- New quotation defaults: 30% deposit, 40% during work, remaining percentage on completion.
- The during-work percentage is adjustable per quotation.
- Quote calculation and printable documents display all three stages.
- Existing quote records without a saved middle-stage percentage display the default 40% when edited/printed.

PAYMENT STAGES DISPLAY FIX:
- Quote list now shows the amount and percentage for deposit, during-work payment, and completion payment.
- The quote calculator clearly labels the three payment stages.
