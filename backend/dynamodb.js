import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { fromIni } from "@aws-sdk/credential-providers";
import dotenv from "dotenv";

dotenv.config();

export const tableNames = {
  books: "Books",
  members: "Members",
  loans: "Loans",
  reviews: "Reviews",
  categories: "Categories",
  payments: "Payments",
  users: "Users",
};

export const tableName = tableNames.books;

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

export const client = new DynamoDBClient(clientConfig);

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
