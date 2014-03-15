module.exports = function(app){

	//home route
	var home = require('../app/controllers/home');
	app.get('/', home.index);

	//search route
	var search = require('../app/controllers/search');
	app.get('/search', search.index);

};
