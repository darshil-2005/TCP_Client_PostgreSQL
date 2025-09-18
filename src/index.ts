/**
 * @file index.ts
 * @brief A barebones TCP client for postgreSQL server.
 * 
 * @details
 * This file implements a barebones TCP client for postgres server.
 * It established a raw TCP connection, authenticates itself using SCHRAM-SHA-256 protocol,
 * and then starts an interactive loop where user enters SQL queries which are then sent 
 * to the server and their response is print to STDOUT.
 * 
 * @note This client is intended for learning/demonstration purpose only and does not 
 * implement the full postgreSQL wire protocol.
 * 
 * @warning DO NOT USE THIS IN PRODUCTION ENVIRONMENT AS IT LACKS SECURITY HARDENING. 
 * 
 * @author Darshil Gandhi
 * @date 2025-09-19
 * @version 0.1
 * 
 * @see https://www.postgresql.org/docs/current/protocol.html
 * @see https://datatracker.ietf.org/doc/html/rfc5802#page-7
 * @see https://datatracker.ietf.org/doc/html/rfc7677
 */



import net from "net";
import crypto from "node:crypto";
import saslprep from 'saslprep';
import readline from "readline-sync";

// Generating a nonce
const nonce = crypto.randomUUID();

let PROCESS_ID;
let SECRET_KEY;

function handleFrame(frame: Buffer) {

    if (frame[0] == undefined) return;

    const flag = String.fromCharCode(frame[0]);
    
    switch (flag) {

        case 'R':
            authFrameHandler(frame);
            break;
        case 'E':
            errorFrameHandler(frame);
            break;
        case 'S':
            parameterStatusFrameHandler(frame);
            break;
        case 'K':
            backendKeyDataHandler(frame);
            break;
        case 'Z':
            readyForQueryHandler(frame);
            break;
        case 'T':
            rowDescriptionHandler(frame);
            break;
        case 'D':
            dataRowhandler(frame);
            break;
        case 'C':
            commandCompleteHandler(frame);
    }
}


const client = net.createConnection({ port: 5432, host: "localhost"}, () => {
    
    const protocolVersion = Buffer.alloc(4);
    protocolVersion.writeUInt16BE(3, 0);     // write 3 in the first 2 bytes
    protocolVersion.writeUInt16BE(0, 2); 

    const username = "user";
    const database = "manaskadb";

    const params = Buffer.concat([
        Buffer.from("user", "utf8"), 
        Buffer.from([0x00]),
        Buffer.from(username, "utf8"), Buffer.from([0x00]),
        Buffer.from("database", "utf8"), Buffer.from([0x00]),
        Buffer.from(database, "utf8"), Buffer.from([0x00]),
        Buffer.from([0x00]) // End of parameters list
    ]);

    const body = Buffer.concat([protocolVersion, params]);

    const totalLength = Buffer.alloc(4);
    totalLength.writeUInt32BE(body.length + 4, 0); // total length includes itself
    const startupMessage = Buffer.concat([totalLength, body]);

    client.write(startupMessage);
});


let pending = Buffer.alloc(0);

client.on('data', function(chunk) {

    pending = Buffer.concat([pending, chunk]);

    while (pending.length >= 5) {

        const messageLength = pending.readInt32BE(1);
        const frameLength = 1 + messageLength;

        if (pending.length < frameLength) break;

        const frame = pending.subarray(0, frameLength);
        pending = pending.subarray(frameLength);

        handleFrame(frame);
    }
});

client.on("error", (error) => {

    console.error("Error: ", error);
});

client.on("end", () => {
    console.log("Connection ended by server.");
});

/**
 * 
 * @section Flag handlers
 * @brief The following section contains all flag handlers.
 */


function commandCompleteHandler(frame: Buffer) {

    const frameLength = frame.readInt32BE(1);
    const stringBuffer = frame.subarray(5, frameLength+1);
    const string = stringBuffer.toString('utf8');

    console.log(string);
}

function dataRowhandler(frame: Buffer) {

    const frameLength = frame.readInt32BE(1);
    const numberOfColumnValues = frame.readInt16BE(5);

    let count=7;

    const rowValues=[];

    for (let i=0; i<numberOfColumnValues; i++) {

        const lenOfColumnValue = frame.readInt32BE(count);
        count=count+4;
        const stringBuffer = frame.subarray(count, count+lenOfColumnValue);
        count=count+lenOfColumnValue;
        const string = stringBuffer.toString('utf8');
        rowValues.push(string);

    }

    console.log(rowValues.join(' | '));
}

function rowDescriptionHandler(frame: Buffer) {

    const frameLength = frame.readInt32BE(1);
    const numberOfFieldsInARow = frame.readInt16BE(5);

    // console.log("Number of fields in a row: ", numberOfFieldsInARow);

    
    let count = 7;

    for (let i=0; i < numberOfFieldsInARow; i++) {
    
        const response = findStringLengthFromBuffer(frame, count); //* response is at the location of 0x00;  
        const stringBuffer = frame.subarray(count, response);
        const string = stringBuffer.toString('utf8');

        count = response;
        const objectId = frame.readInt32BE(count);
        
        count = count + 4;
        const attributeNumber = frame.readInt16BE(count);
        
        count = count + 2;
        const objectIdOfFieldDataType = frame.readInt32BE(count);
        
        count = count + 4;
        const dataTypeSize=frame.readInt16BE(count);
        
        count = count + 2;
        const typeModifier=frame.readInt32BE(count);
        
        count = count + 4;
        const formatCodeForField=frame.readInt16BE(count);

        // console.log("___ROW_DESCRIPTION_OUTPUT_STARTS");
        // console.log("String:", string);
        // console.log("Object ID: ", objectId);
        // console.log("Attribute Number: ", attributeNumber);
        // console.log("Object Id of Fielf Data Type: ", objectIdOfFieldDataType);
        // console.log("Data Type Size: ", dataTypeSize);
        // console.log("Type Modifier: ", typeModifier);
        // console.log("Format Code: ", formatCodeForField);
        // console.log("___ROW_DESCRIPTION_OUTPUT_ENDS");

        count=count+2;    
    }


}


function readyForQueryHandler(frame: Buffer) {

    const lengthFrame = frame.readInt32BE(1);
    const backendTransitionStatusIndicator = String.fromCharCode(frame[5] as number);
    // console.log(lengthFrame, backendTransitionStatusIndicator);

    const charBuffer = Buffer.alloc(1);
    charBuffer.write('Q', 0, 1, 'utf8');

    let query = readline.question("Darshil's client> ");
    
    if (!query){
        query="SELECT * FROM users;";   
    }

    const queryBuffer = Buffer.from(query, 'utf8');

    const messageLength = Buffer.alloc(4);
    messageLength.writeInt32BE(4 + queryBuffer.length + 1, 0);

    client.write(Buffer.concat([charBuffer, messageLength, queryBuffer, Buffer.from([0x00])])); 
}

function backendKeyDataHandler(frame: Buffer) {

    const lengthFrame = frame.readInt32BE(1);
    const processId = frame.readInt32BE(5);
    const secretKey = frame.readInt32BE(9);

    PROCESS_ID = processId;
    SECRET_KEY = secretKey;

    // console.log(lengthFrame, processId, secretKey);
}

function parameterStatusFrameHandler(frame :Buffer) {

    const lengthFrame = frame.readInt32BE(1);
    const stringBuffer = frame.subarray(5, lengthFrame+1);
    const stringList = stringBuffer.toString('utf8').split('\0').filter(Boolean);

    // console.log(stringList);
}

function authFrameHandler(frame: Buffer) {

    const lengthFrame = frame.readInt32BE(1);
    const status = frame.readInt32BE(5);

    if (status == 10) {

        const listOfSASLMech = frame.subarray(9, lengthFrame+1);
        const list = listOfSASLMech.toString("utf8").split('\0').filter(Boolean);
        // console.log(list);

        
        const id = Buffer.alloc(1);
        id.write('p', 0, 1, 'utf8');
        
        // Name of the SASL mechanism choosen
        const name = Buffer.concat([Buffer.from('SCRAM-SHA-256'), Buffer.from([0x00])]);
        
        // Initial Response
        const clientFirstMessage = Buffer.from(`n,,n=user,r=${nonce}`, 'utf8');
        
        const lenMessage = Buffer.alloc(4);
        lenMessage.writeInt32BE( 4 + name.length + 4 + clientFirstMessage.length);
        
        const clientFirstMesLen = Buffer.alloc(4);
        clientFirstMesLen.writeInt32BE(clientFirstMessage.length);

        
        let finalMessage=Buffer.concat([id, lenMessage, name, clientFirstMesLen, clientFirstMessage]);
        client.write(finalMessage);
    }

    if (status == 11) {

        const listOfSASLData = frame.subarray(9, lengthFrame+1);
        const list = listOfSASLData.toString("utf8").split(",");
        // console.log(list);

        const id = Buffer.alloc(1);
        id.write('p', 0, 1, 'utf8');

        
        if (!list) {
            return;
        }

        const serverNonce = list[0]?.split('=')[1];
        const salt = list[1]?.split('=')[1];
        const iterations = list[2]?.split('=')[1];

        if (!salt || !iterations) {
            return;
        }

        const normalizedPassword = saslprep("password");
        const saltedPassword = crypto.pbkdf2Sync(normalizedPassword, Buffer.from(salt, 'base64'), Number(iterations), 32, "sha256");
        const clientKey = crypto.createHmac("sha256", saltedPassword).update("Client Key").digest();
        const storedKey = crypto.createHash("sha256").update(clientKey).digest();   
        const finalMesWOP = "c=biws" + "," + list[0]; 
        const authMessage = `n=user,r=${nonce}` + "," + list.join(',') + "," + finalMesWOP;
        const clientSignature = crypto.createHmac("sha256", storedKey).update(authMessage).digest();
        const clientProof = xorBuffers(clientKey, clientSignature);
        const proofBase64 = clientProof.toString("base64");
        const clientFinalMessage = Buffer.from(`c=biws,r=${serverNonce},p=${proofBase64}`, "utf8");
        const lenMessage = Buffer.alloc(4);
        lenMessage.writeInt32BE(clientFinalMessage.length + 4);
        client.write(Buffer.concat([id, lenMessage, clientFinalMessage]));
    }

    if (status == 12) {
        const stringBuffer = frame.subarray(9, lengthFrame+1);
        const string = stringBuffer.toString("utf8").split(',').filter(Boolean);
        // console.log(string);
    }

    if (status == 0) {
        // console.log("Authenticationok message received from postgres server!!");
        console.log("Connected!!");
    }
}


function errorFrameHandler(frame: Buffer) {

    const lengthFrame = frame.readInt32BE(1);
    const identifierByte = String.fromCharCode(frame[5] as number);

    if (identifierByte == '0' || !identifierByte) {
        return;
    }

    const stringBuffer = frame.subarray(6, lengthFrame+1);
    const string = stringBuffer.toString("utf8").split('\0').filter(Boolean);
    console.log("IdentifierByte: ", identifierByte, '\n', "Error: ", string);
}

/**
 * @brief XORs two buffer
 * @param buf1 
 * @param buf2 
 * @returns The XOR of both buffers
 */
function xorBuffers(buf1: any, buf2: any) {
  const out = Buffer.alloc(Math.min(buf1.length, buf2.length));
  for (let i = 0; i < out.length; i++) {
    out[i] = buf1[i] ^ buf2[i];
  }
  return out;
}

/**
 * @brief Finds full piece of string from the frame.
 * @details Starts from offset index in frame and goes on adding one to count till it sees a null terminator,
 * then return the index after the index of null terminator.
 * @param frame 
 * @param offset 
 * @returns Index after null terminator of a string that starts at offset.
 * 
 * @example
 * Index: 7,   8,   9,   10
 * Char: 'i', 'd', '\0', '#'
 * findStringLengthFromBuffer(frame, 7) returns 10
 */

function findStringLengthFromBuffer(frame: Buffer, offset: number) {
    let count = offset;
    while (frame[count] != Buffer.from([0x00])[0]) {
        count++
    }
    return count+1;
}