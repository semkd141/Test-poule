import http from 'https';

const options = {
	method: 'GET',
	hostname: 'free-api-live-football-data.p.rapidapi.com',
	port: null,
	path: '/football-get-match-event-all-stats?eventid=4947237',
	headers: {
		'x-rapidapi-key': 'dd8e8b92e7msh31059608a6be0b6p1dd32ejsn64e99e931004',
		'x-rapidapi-host': 'free-api-live-football-data.p.rapidapi.com',
		'Content-Type': 'application/json'
	}
};

const req = http.request(options, function (res) {
	const chunks = [];

	res.on('data', function (chunk) {
		chunks.push(chunk);
	});

	res.on('end', function () {
		const body = Buffer.concat(chunks);
		console.log(body.toString());
	});
});

req.end();