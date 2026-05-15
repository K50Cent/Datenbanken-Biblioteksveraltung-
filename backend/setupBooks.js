import {CreateTableCommand} from "@aws-sdk/client-dynamodb"; //neue Tabelle anlegen wollen
import { client } from "./dynamodb.js"; //Import DynamoDB-Client

async function createBooksTable() { //asynchron, weil operationen von DynamoDB Zeit brauchen
    const command = new CreateTableCommand({
        TableName: "Books",
        AttributeDefinitions: [
            {AttributeName: "bookID", AttributeType: "S"} //uuid von node, dynamodb hat keinen automatischen Zähler
            //andere Attribute müssen nicht definiert werden, DBD ist schemalos
        ],
        KeySchema: [
            { AttributeName: "bookID", KeyType: "HASH" }, //Partitionkey
        ],
        BillingMode: "PAY_PER_REQUEST", //zahlen nur für tatsächliche Lese-/Schreibzugriffe und keine Kapazitätsplanung
    });

    try {
        await client.send(command); //befehl schicken und dann warten bis DBD antwortet
        console.log("Books-Tabelle wurde erstellt");
    } catch (error) {
        console.error("Fehler beim Erstellen der Tabelle;", error);
    }
}

createBooksTable();