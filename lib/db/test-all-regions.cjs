async function run() {
  const ip = '2600:1f1e:dbb:f600:fe5:d6d5:dbf:bccc';
  const url = `https://rdap.arin.net/registry/ip/${ip}`;
  console.log('Fetching RDAP for IP:', ip);
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('Name:', data.name);
    console.log('Country:', data.country);
    console.log('Remarks:', JSON.stringify(data.remarks, null, 2));
  } catch (err) {
    console.error('Failed to fetch RDAP:', err.message);
  }
}

run();
