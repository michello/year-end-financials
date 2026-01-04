# Financial CSV Compiler

This repository generates a consolidated CSV summary of expenses that can be imported into an expense and income tracking spreadsheet.

[link to financial csv compiler](https://michello.github.io/financial-spending-csv-compiler/)

**Prerequisite:**  
Make a copy of this Google Sheets template before getting started:  
https://docs.google.com/spreadsheets/d/12fIziabNlr78DHNmiQKuXEieBptjaTfjoyrLM1ZUCuk/edit?gid=2058213571#gid=2058213571

## How to Use

1. Download CSV files from your supported banks or services:
    - AMEX  
    - Capital One  
    - Chase  
    - Chase (Business)  
    - Discover  
    - Old Navy  
    - Venmo
    - Fidelity
    - Wealthfront *(coming soon)*  

2. Upload all CSV files you want cleaned and combined by clicking **Choose File**.  
   ![Choose File button](img/upload-button.png)

3. After uploading a file, verify or update the card type to ensure the CSV is categorized correctly.  
   ![Card type selector](image.png)

4. Repeat the upload process for as many cards as you’d like.

5. Once all files are uploaded, click **Compile** (located next to the **Choose File** button) to generate the aggregated output.

6. Click **Download Compiled CSV**, then import it into the Expense + Income Tracker template:
    - Copy the contents of the compiled CSV
    - Paste them into the **Expenses** tab of the spreadsheet:  
      https://docs.google.com/spreadsheets/d/12fIziabNlr78DHNmiQKuXEieBptjaTfjoyrLM1ZUCuk/edit?gid=1528073380#gid=1528073380
    - Select the pasted data, open the **Data** menu in Google Sheets, and choose **Split text to columns**
