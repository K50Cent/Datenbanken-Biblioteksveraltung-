const { GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient, tableNames } = require("./dynamodb.cjs");

async function scan(tableName, params = {}) {
  const result = await docClient.send(
    new ScanCommand({
      TableName: tableName,
      ...params,
    })
  );

  return result.Items || [];
}

async function get(tableName, key) {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: key,
    })
  );

  return result.Item;
}

async function runExamples() {
  const books = await scan(tableNames.books);

  const searchTerm = "informatik";
  const searchResults = books.filter((book) =>
    [book.title, book.author, book.isbn, book.category].some((value) =>
      String(value || "").toLowerCase().includes(searchTerm)
    )
  );

  const sortedByRating = [...books]
    .sort((a, b) => Number(b.averageRating || 0) - Number(a.averageRating || 0))
    .map((book) => ({
      title: book.title,
      averageRating: book.averageRating,
    }));

  const loan = await get(tableNames.loans, { loanId: "loan-001" });
  const linkedBook = await get(tableNames.books, { bookId: loan.bookId });

  const member = await get(tableNames.members, { memberId: loan.memberId });
  const category = await get(tableNames.categories, {
    categoryId: linkedBook.categoryId,
  });

  const itBooks = books.filter((book) => book.category === "Informatik");
  const avgInformatikRating =
    itBooks.reduce((sum, book) => sum + Number(book.averageRating || 0), 0) /
    itBooks.length;

  const borrowedBooks = books.filter((book) => book.available === false);
  const payments = await scan(tableNames.payments);
  const feeSum = payments
    .filter((payment) => payment.type === "fee")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  console.log(
    JSON.stringify(
      {
        search: {
          term: searchTerm,
          count: searchResults.length,
          titles: searchResults.map((book) => book.title),
        },
        sortedByRating,
        documentLink: {
          loanId: loan.loanId,
          bookId: linkedBook.bookId,
          bookTitle: linkedBook.title,
        },
        fourStepChain: {
          member: `${member.firstName} ${member.lastName}`,
          loanId: loan.loanId,
          book: linkedBook.title,
          category: category.name,
        },
        aggregations: {
          avgInformatikRating: Number(avgInformatikRating.toFixed(2)),
          borrowedBooks: borrowedBooks.length,
          feeSum,
        },
      },
      null,
      2
    )
  );
}

runExamples().catch((error) => {
  console.error("Demo-Abfragen fehlgeschlagen:", error.message);
  process.exit(1);
});
