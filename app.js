var WebSocket = require('ws');

var GrovePi = require('node-grovepi').GrovePi;
var Commands = GrovePi.commands;
var Board = GrovePi.board;
var DHTDigitalSensor = GrovePi.sensors.DHTDigital;

var grovePiBoard;

//const ws = new WebSocket('ws://predix-demos-forwarding-server.run.aws-usw02-pr.ice.predix.io');
const ws = new WebSocket('ws://10.15.16.187:8083');

ws.on('open', function open() {
	console.log('Websocket connection established');
});

ws.on('message', function message(data, flags) {
	// We shouldn't ever receive a message from the forwarding server
});

ws.on('close', function close() {
	console.log('Websocket connection closed');
});

function initializeBoard() {
	console.log('---- initializing the GrovePi ----');

	grovePiBoard = new Board({
		debug: true,
		onError: function(err) {
			console.log('An error occured on the GrovePi: ');
			console.log(err);
		},
		onInit: function(res) {
			if (res) {
				// Connect Digital Humidity and Temperature sensor in Digital Port 4
				var dhtSensor = new DHTDigitalSensor(4, DHTDigitalSensor.VERSION.DHT22, DHTDigitalSensor.CELSIUS);
				
				console.log('GrovePi Version: ' + grovePiBoard.version());

				console.log('Begin poll of sensor: DHT Digital Sensor');
				dhtSensor.on('change', function(res) {
					var filteredData = filterDHT(res);
					if(filteredData) {
						console.log('Temperature: ' + filteredData['temperature']);
						console.log('Humidity: ' + filteredData['humidity']);
						ws.send(JSON.stringify(filteredData));
					}
				});
				dhtSensor.watch(500);	// milliseconds
			}
			else {
				console.log('Unable to initialize GrovePi');
			}
		}
	});
	grovePiBoard.init();
}

/*
	The Temperature & Humidity sensor likes to produce readings
	that are far beyond any achievable temperature on earth.
	If the sensor produces any of these values, just ignore them.
*/
function filterDHT(readValues) {
	if (readValues[0] > 100 || readValues[1] > 100) {
		return false;
	}
	else {
		// Correctly format the data to send to our forwarding server
		// Remove the last reading
		var tempAndHum = {
			"temperature": readValues[0],
			"humidity": readValues[1]
		};
		return tempAndHum;
	}
}

function onExit(err) {
	console.log('Shutting down the GrovePi');
	grovePiBoard.close();
	process.removeAllListeners();
	process.exit();
	if (typeof err != 'undefined') {
		console.log(err);
	}
}


initializeBoard();
process.on('SIGINT', onExit);
process.on('SIGTERM', onExit);
