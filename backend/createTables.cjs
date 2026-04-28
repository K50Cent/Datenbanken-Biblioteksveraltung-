const {
  CreateTableCommand,
  DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");
const { client, tableNames } = require("./dynamodb.cjs");

const tableDefinitions = [
  {
    TableName: tableNames.books,
    AttributeDefinitions: [{ AttributeName: "bookId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "bookId", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: tableNames.members,
    AttributeDefinitions: [{ AttributeName: "memberId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "memberId", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: tableNames.loans,
    AttributeDefinitions: [{ AttributeName: "loanId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "loanId", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: tableNames.reviews,
    AttributeDefinitions: [{ AttributeName: "reviewId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "reviewId", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: tableNames.categories,
    AttributeDefinitions: [{ AttributeName: "categoryId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "categoryId", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: tableNames.payments,
    AttributeDefinitions: [{ AttributeName: "paymentId", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "paymentId", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: tableNames.users,
    AttributeDefinitions: [{ AttributeName: "usernameKey", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "usernameKey", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
];

async function tableExists(tableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      return false;
    }

    throw error;
  }
}

async function waitForTable(tableName) {
  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await client.send(
      new DescribeTableCommand({ TableName: tableName })
    );

    if (result.Table?.TableStatus === "ACTIVE") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Tabelle ${tableName} wurde nicht rechtzeitig aktiv.`);
}

async function createTables() {
  for (const definition of tableDefinitions) {
    if (await tableExists(definition.TableName)) {
      console.log(`Tabelle ${definition.TableName} existiert bereits.`);
      continue;
    }

    await client.send(new CreateTableCommand(definition));

    await waitForTable(definition.TableName);
    console.log(`Tabelle ${definition.TableName} wurde erstellt.`);
  }
}

createTables().catch((error) => {
  console.error("Tabellenerstellung fehlgeschlagen:", error.message);
  process.exit(1);
});
