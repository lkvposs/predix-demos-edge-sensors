var WebSocket = require('ws');

var GrovePi = require('node-grovepi').GrovePi;
var Commands = GrovePi.commands;
var Board = GrovePi.board;
var DHTDigitalSensor = GrovePi.sensors.DHTDigital;
var UltrasonicSensor = GrovePi.sensors.UltrasonicDigital;

var grovePiBoard;

var previousTimeReading = -1;
var previousUltrasonicReading = -1;
var WING_DISTANCE_THRESHOLD = 10;
var previousPeriods = new Array();
var NUMBER_PREVIOUS_PERIODS = 5;
var previous_periods = 0;
var smoothedPeriod;

const ws = new WebSocket('wss://predix-demos-forwarding-server.run.aws-usw02-pr.ice.predix.io/input/west/arlington');
//const ws = new WebSocket('ws://10.15.29.216:8083');

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
				// Connect Humidity and Temperature sensor in Digital Port 4
				var dhtSensor = new DHTDigitalSensor(4, DHTDigitalSensor.VERSION.DHT22, DHTDigitalSensor.CELSIUS);
				// Connect Ultrasonice Sensor in Digital Port 3
				var ultrasonicSensor = new UltrasonicSensor(3);
				
				console.log('GrovePi Version: ' + grovePiBoard.version());

				console.log('Begin poll of sensor: DHT Digital Sensor');
				dhtSensor.on('change', function(res) {
					var filteredData = filterDHT(res);
					if(filteredData) {
						//console.log('Temperature: ' + filteredData[0].datapoints[0][1]);
						//console.log('Humidity: ' + filteredData[1].datapoints[0][1]);
						// Send temperature reading to forwarding server
						ws.send(JSON.stringify(filteredData[0]));
						// Send humidity reading to forwarding server
						ws.send(JSON.stringify(filteredData[1]));
					}
				});
				dhtSensor.watch(500);	// milliseconds

				console.log('Begin poll of sensor: Ultrasonice Sensor');
				//ultrasonicSensor.on('change', function(res) {
				//	console.log('Ultrasonic reading: ' + res);
				//});
				//ultrasonicSensor.watch();
				ultrasonicSensor.stream(10, function(res) {
					console.log('Ultrasonic reading: ' + res);
					var data = new Array();
					data[0] = {
						"name": "arlington/ultrasonic",
						"datapoints": [[Date.now(), res]],
						"tag": "ultrasonic"
					};
					try {
						ws.send(JSON.stringify(data[0]));
					}
					catch (err) {
						console.log('Did not send data');
					}
					if (previousUltrasonicReading === -1) {
						previousUltrasonicReading = res;
					}
					else {
						if (res < WING_DISTANCE_THRESHOLD && previousUltrasonicReading > WING_DISTANCE_THRESHOLD) {
							var currentTimeReading = Date.now();
							if (previousTimeReading != -1) {
								// Calculate frequency
								var currentTimeReading = Date.now();
								var period = (currentTimeReading - previousTimeReading)*3/1000;
								if (previous_periods < NUMBER_PREVIOUS_PERIODS) {
									previousPeriods.push(period);
									previous_periods += 1;
								}
								else {
									previousPeriods.shift();
									previousPeriods.push(period);
									var ave = 0;
									for (var i=0; i<previousPeriods.length; i++) {
										ave += previousPeriods[i];
									}
									ave /= previousPeriods.length;
									console.log('Cached period data: ' + previousPeriods);
									console.log('Average period data: ' + ave);
									var frequency = 60/ave;
									console.log('Frequency data: ' + frequency);
									var data = new Array();
									data[0] = {
										"name": "arlington/frequency",
										"datapoints": [[Date.now(), frequency]],
										"tag": "frequency"
									};
									try {
										ws.send(JSON.stringify(data[0]));
									}
									catch (err) {
										console.log('Did not send data');
									}
								}
								previousTimeReading = currentTimeReading;
							}
							previousTimeReading = currentTimeReading;
						}
						previousUltrasonicReading = res;
					}
					//var ultrasonicReading = {
					//	"name": "Arlington/Ultrasonic",
					//	"datapoints": [[Date.now(), res]],
					//	"tag": "ultrasonic"
					//};
					//ws.send(JSON.stringify(ultrasonicReading));
				});
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
		var data = new Array();
		data[0] = {
			"name": "Arlington/Temperature",
			"datapoints": [[Date.now(), readValues[0]]],
			"tag": "temperature"
		};
		data[1] = {
			"name": "Arlington/Humidity",
			"datapoints": [[Date.now(), readValues[1]]],
			"tag": "humidity"
		};
		return data;
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
