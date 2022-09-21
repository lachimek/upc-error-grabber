import { ConnectBoxClient } from "./ConnectBoxClient";
import { MongoBulkWriteError, MongoClient } from "mongodb";
require("console-stamp")(console, "HH:MM:ss.l");

const DB_PASSWORD = "";
const UPC_PASSWORD = "";

const uri = `mongodb+srv://upc-error-grabber:${DB_PASSWORD}@cluster0.8uhvbdq.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

//fun:13
const cbc = new ConnectBoxClient();
const DEBUG = true;

export async function main() {
    try {
        console.log("Loging in to ConnectBox...");
        const loginResult = await cbc.login(UPC_PASSWORD);
        if (loginResult.status === 200 && loginResult.data.includes("successful")) {
            console.log("Login successful: " + loginResult.data.substring(0, 50));
        } else if (loginResult.status === 302) {
            console.log("Login failed: Session already active" + loginResult.data.substring(0, 50));
            return;
        } else {
            console.log("Login failed: " + loginResult.data.substring(0, 50));
            if (DEBUG) console.log(loginResult);
            return;
        }

        try {
            console.log("Connecting with db");
            await client.connect();
            const db = client.db("upc-errors");
            const col = db.collection("records");
            const errorLog = await cbc.getErrorHistory();
            console.log("Saving data in db");
            const insertResponse = await col.insertMany(errorLog, { ordered: false });
        } catch (err) {
            if (err instanceof MongoBulkWriteError) {
                console.log(`Inserted ${err.result.nInserted} record/s.`);
            } else {
                console.log(err);
            }
        } finally {
            console.log("Closing connection with db");
            await client.close();
        }

        console.log("Logging out from ConnectBox...");
        const logoutResult = await cbc.logout();
        if (logoutResult.status === 200 && logoutResult.data === "") {
            console.log("Logout successful.");
        } else {
            console.log("Logout failed: " + logoutResult.data.substring(0, 50));
        }
    } catch (err) {
        console.log("There was an error while trying to communicate with the ConnectBox.");
        if (err instanceof Error) console.log(err.toString());
        if (DEBUG) console.log(err);
    }
}

main();
