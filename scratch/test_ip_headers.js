import dotenv from 'dotenv';
dotenv.config();

const client_id = process.env.CODEF_CLIENT_ID;
const client_secret = process.env.CODEF_CLIENT_SECRET;

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
  console.log('Obtained Token:', token ? 'YES' : 'NO');

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

  const testIP = "211.234.201.48";
  const testHeaders = [
    { "Origin": `http://${testIP}`, "Referer": `http://${testIP}/` },
    { "Origin": `https://${testIP}`, "Referer": `https://${testIP}/` },
    { "Origin": `http://${testIP}:3000`, "Referer": `http://${testIP}:3000/` },
    { "Origin": `http://localhost:3000`, "Referer": `http://localhost:3000/` }
  ];

  for (const h of testHeaders) {
    console.log(`Testing with headers:`, h);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        ...h
      },
      body: JSON.stringify(payload),
      redirect: "manual"
    });

    console.log('HTTP Status:', res.status);
    console.log('Location:', res.headers.get('location'));
  }
}

run().catch(console.error);
