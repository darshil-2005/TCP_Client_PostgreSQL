# Barebones PostgreSQL TCP Client

A minimal TCP client written in TypeScript that connects directly to a PostgreSQL server over raw sockets.  
It demonstrates how to:

- Establish a TCP connection to PostgreSQL  
- Send the **startup message**  
- Authenticate using **SCRAM-SHA-256**  
- Accept user input, forward queries to the server, and print responses to `STDOUT`  

⚠️ This project is for **educational purposes only**.  
It does not implement the full PostgreSQL wire protocol and should not be used in production.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (>= 18)  
- A running PostgreSQL server  

### Install dependencies
```bash
npm install
```
### Run client
```bash
npm start
```

---

## 👤 Author

**Darshil Gandhi**    

- GitHub: [@darshil-2005](https://github.com/darshil-2005)  

---