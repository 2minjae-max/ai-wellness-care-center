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

  console.log('Sending request with https://ai-wellness-care-center.onrender.com as Origin & Referer...');
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Origin": "https://ai-wellness-care-center.onrender.com",
      "Referer": "https://ai-wellness-care-center.onrender.com/"
    },
    body: JSON.stringify(payload),
    redirect: "manual"
  });

  console.log('HTTP Status:', res.status);
  console.log('Headers:', Object.fromEntries(res.headers.entries()));
  const bodyText = await res.text();
  console.log('Body:', bodyText.substring(0, 1000));
}

run().catch(console.error);
