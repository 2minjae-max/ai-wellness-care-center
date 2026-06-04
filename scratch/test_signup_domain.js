import dotenv from 'dotenv';
dotenv.config();

const client_id = process.env.CODEF_CLIENT_ID;
const client_secret = process.env.CODEF_CLIENT_SECRET;

const domains = [
  "naver.com",
  "daum.net",
  "gmail.com",
  "google.com",
  "hanwha.co.kr",
  "hanwha.com",
  "hanwhalife.com",
  "hanwhageneral.co.kr",
  "codef.io",
  "localhost",
  "127.0.0.1",
  "onrender.com"
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

  for (const d of domains) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Origin": `https://${d}`,
          "Referer": `https://${d}/`
        },
        body: JSON.stringify(payload),
        redirect: "manual"
      });

      console.log(`Domain: ${d} -> Status: ${res.status}, Location: ${res.headers.get('location') || 'N/A'}`);
    } catch (err) {
      console.log(`Domain: ${d} -> Error: ${err.message}`);
    }
  }
}

run().catch(console.error);
