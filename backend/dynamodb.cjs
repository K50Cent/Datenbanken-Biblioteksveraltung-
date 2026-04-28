const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { fromIni } = require("@aws-sdk/credential-providers");
const dotenv = require("dotenv");

dotenv.config();

const tableNames = {
  books: "Books",
  members: "Members",
  loans: "Loans",
  reviews: "Reviews",
  categories: "Categories",
  payments: "Payments",
  users: "Users",
};

const clientConfig = {
  region: process.env.AWS_REGION || "eu-central-1",
};

if (process.env.DYNAMODB_ENDPOINT) {
  clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "dummy",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "dummy",
  };
} else if (process.env.AWS_PROFILE) {
  clientConfig.credentials = fromIni({
    profile: process.env.AWS_PROFILE,
  });
}

const client = new DynamoDBClient(clientConfig);

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

module.exports = {
  client,
  docClient,
  tableName: tableNames.books,
  tableNames,
};
