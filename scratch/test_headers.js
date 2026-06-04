import dotenv from 'dotenv';
dotenv.config();

const client_id = process.env.CODEF_CLIENT_ID;
const client_secret = process.env.CODEF_CLIENT_SECRET;

const testCases = [
  { name: "1. No Origin/Referer", headers: {} },
  { name: "2. localhost with port 3000 (http)", headers: { "Origin": "http://localhost:3000", "Referer": "http://localhost:3000/" } },
  { name: "3. localhost no port (http)", headers: { "Origin": "http://localhost", "Referer": "http://localhost/" } },
  { name: "4. localhost no port (https)", headers: { "Origin": "https://localhost", "Referer": "https://localhost/" } },
  { name: "5. 127.0.0.1 with port 3000", headers: { "Origin": "http://127.0.0.1:3000", "Referer": "http://127.0.0.1:3000/" } },
  { name: "6. 127.0.0.1 no port", headers: { "Origin": "http://127.0.0.1", "Referer": "http://127.0.0.1/" } },
  { name: "7. Render domain", headers: { "Origin": "https://ai-wellness-care-center.onrender.com", "Referer": "https://ai-wellness-care-center.onrender.com/" } },
  { name: "8. CODEF domain (https)", headers: { "Origin": "https://codef.io", "Referer": "https://codef.io/" } },
  { name: "9. Raw localhost (no protocol)", headers: { "Origin": "localhost", "Referer": "localhost" } },
];

async function run() {
  const authHeader = Buffer.from(`${client_id}:${client_secret}`).toString("base64");
  const tokenRes = await fetch("https://oauth.codef.io/oauth/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  
  const url = "https://sandbox.codef.io/v1/kr/public/pp/nhis-health-checkup/result";
  const payload = {
    organization: "0002",
    identity: "19840323",
    userName: "홍길동",
    phoneNo: "01020571754",
    telecom: "0",
    loginType: "5",
    loginTypeLevel: "1",
    simpleAuthType: "1",
    type: "1"
  };

  for (const tc of testCases) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          ...tc.headers
        },
        body: JSON.stringify(payload),
        redirect: "manual"
      });

      console.log(`${tc.name} -> Status: ${res.status}, Location: ${res.headers.get('location') || 'N/A'}`);
    } catch (err) {
      console.log(`${tc.name} -> Error: ${err.message}`);
    }
  }
}

run().catch(console.error);
