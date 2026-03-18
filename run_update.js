async function run() {
    console.log('Fetching data...');
    let res = await fetch('http://localhost:3000/api/update-data?step=data', {method: 'POST'});
    let t = await res.text();
    console.log('Data:', t);
}
run();
