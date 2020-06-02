function download(filename, content) {
	if (navigator.msSaveBlob) { // IE 10+ 
		navigator.msSaveBlob(new Blob([content], {
			type: 'text/json;charset=utf-8;'
		}), filename);
	} else {
		var element = document.createElement('a');
		element.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(content));
		element.setAttribute('download', filename);

		element.style.display = 'none';
		document.body.appendChild(element);

		element.click();

		document.body.removeChild(element);
	}
}

// ServiceWorker is a progressive technology. Ignore unsupported browsers
if('serviceWorker' in navigator) {
	console.log('CLIENT: service worker registration in progress.');
	navigator.serviceWorker.register('./service-worker.js').then(function() {
	console.log('CLIENT: service worker registration complete.');
}, function() {
	console.log('CLIENT: service worker registration failure.');
});
} else {
	console.log('CLIENT: service worker is not supported.');
}

$(document).ready(function() {

	//Full-screen modals	
	$('#outputModal').on('shown.bs.modal', function() {
		$(this).find('.modal-dialog').css({
			width: 'auto',
			height: 'auto',
			'max-height': '100%'
		});

		//Dygraphs window resize. Workaround for blank graphs at load time. This is for the initial load.
		for (var i = 0; i < Simulation.g.length; i++) {
			Simulation.g[i].resize();
		}
	});

	// Enable tooltops
	$(function () {
		$('[data-toggle="tooltip"]').tooltip()
	});

	//Resizing dygraphs graphs when output tab is clicked. This allows graphs to be seen when switching tabs.
	$('a[data-toggle="tab"]').on('shown.bs.tab', function(e) {
		//Dygraphs window resize. Workaround for blank graphs at load time. This is for resizing when changing tabs. 
		for (var i = 0; i < Simulation.g.length; i++) {
			Simulation.g[i].resize();
		}
	});

	//Open the Save Sim input field containing simName input and submit/cancel buttons
	$('#saveSimBtn').click(function(e) {
		$('#saveSimPopup').modal('show');
	});

	//When Saved Sim is submitted, save to file
	$('#confirmSaveSim').click(function(e) {
		e.stopImmediatePropagation();
		Simulation.saveSim();
	});

	//Open the Load Sim input field containing file input and submit/cancel buttons
	$('#loadSimBtn').click(function(e) {
		$('#loadSimPopup').modal('show');
	});

	//When Load Sim is submitted, load data from file
	$('#confirmLoadSim').click(function(e) {
		e.stopImmediatePropagation();
		f = $('#file').prop('files')[0];
		var reader = new FileReader();
		reader.onload = function(e){
			var data = e.target.result;
			Simulation.loadSavedSim(data);
		}
		reader.readAsText(f);
	});

	//Open the help popul 
	$('.btn-help').click(function(e) {
		var dataURL = $(this).attr('data-href');
		var dataTitle = $(this).attr('data-title');
		$('#helpPopup').modal('show').find('.modal-body').load(dataURL);
		$('#helpPopup').find('.modal-title').text(dataTitle);
	  });
	// Toggle up/down icon on show hide of collapse element
	$("#gettingStarted").on('show.bs.collapse', function(){
		$(this).prev(".panel-heading").find("img").attr("src","image/up.svg");
		if (typeof(Storage) !== "undefined") {
			localStorage.setItem('hidegs','0');
		}
	}).on('hide.bs.collapse', function(){
		$(this).prev(".panel-heading").find("img").attr("src","image/down.svg");
		if (typeof(Storage) !== "undefined") {
			localStorage.setItem('hidegs','1');
		}
	});

	// Show getting started unless user previously hid it.
	var showpane = true;
	if (typeof(Storage) !== "undefined") {
		var hidegs = localStorage.getItem("hidegs");
		if (hidegs == '1'){
			showpane = false;
		}
	}
	if (showpane == true){
		$("#gettingStarted").addClass('in');
		$("#gettingStarted").prev(".panel-heading").find("img").attr("src","image/up.svg");
	}
});

var Simulation = {
	sim: [],
	tabs: 0,
	g: [], //dygraph object
	loadSavedSim: function(data) {
		//Load in angular scope from outside the controller
		var scope = angular.element($("#input")).scope();
		scope.$apply(function() {
			scope.data = JSON.parse(data);
			//Refresh form to show proper data options after loading
			scope.refreshDataForm();
			scope.refreshSpendingForm();
			scope.refreshInvestigateForm();
			scope.refreshRebalanceAnnuallyOptions();
            $('#loadSimPopup').modal('hide');
		});
	},
	saveSim: function() {
		var scope = angular.element($("#input")).scope();
		scope.$apply(function() {
			var json_savedSim = JSON.stringify(scope.data, null, 2);
			download($('#simNameInput').val()+'.FIREsim',json_savedSim)
			$('#saveSimPopup').modal('hide');
		});
	},
	runSimulation: function(form) {
		this.tabs++;
		console.log("Form Data:", form);
		this.sim = []; //Deletes previous simulation values if they exist.
		var startYear = form.simulationStartYear;
		var endYear = form.retirementEndYear;
		var cycleLength = endYear - startYear + 1;
		var numCycles = 0;
		var cycleStart = 1871;

		switch (form.data.method){
			case "singleCycle":
				numCycles = 1;
				cycleStart = parseInt(form.data.singleStart);
				var cyc = this.cycle(cycleStart, cycleStart + cycleLength);
				this.sim.push(cyc);
				break;
			case "historicalAll":
			case "constant":
				numCycles = Object.keys(Market).length - cycleLength + 1;
				for (cycleStart; cycleStart < 1871 + numCycles; cycleStart++) {
					var cyc = this.cycle(cycleStart, cycleStart + cycleLength);
					this.sim.push(cyc);
				}
				break;
			case "historicalSpecific":
				numCycles = (form.data.end - form.data.start) - cycleLength + 2;
				cycleStart = parseInt(form.data.start);
				for (var i = cycleStart; i < (cycleStart + numCycles); i++) {
					var cyc = this.cycle(i, i + cycleLength);
					this.sim.push(cyc);
				}
				break;
			case "historicalCape":
				// get list of suitable start years
				numCycles = Object.keys(Market).length - cycleLength + 1;
				var filteredYears = [];
				for (cycleStart; cycleStart < 1871 + numCycles; cycleStart++) {
					if ((!form.data.mincape || form.data.mincape < Market[cycleStart]["cape"]) &&
						(!form.data.maxcape || form.data.maxcape > Market[cycleStart]["cape"] )){
						filteredYears.push(cycleStart)
					}
				}
				for (i=0; i < filteredYears.length; i++){
					cycleStart = filteredYears[i]
					var cyc = this.cycle(cycleStart, cycleStart + cycleLength);
					this.sim.push(cyc);
				}
		}

		if (form.investigate.type == 'none') {
			for (var i = 0; i < this.sim.length; i++) {
				for (var j = 0; j < this.sim[i].length; j++) {
					this.calcStartPortfolio(form, i, j); //Return Starting portfolio value to kick off yearly simulation cycles
					this.calcSumOfAdjustments(form, i, j);
					this.calcSpending(form, i, j); //Nominal spending for this specific cycle
					this.calcMarketGains(form, i, j); //Calculate market gains on portfolio based on allocation from form and data points
					this.calcEndPortfolio(form, i, j); //Sum up ending portfolio
				}
			}

			//Run post-simulation functions
			this.convertToCSV(this.sim);
			this.calcFailures(this.sim);
			this.displayGraph(this.sim, form);

			//Initialize statistics calculations
			StatsModule.init(this.sim, form);

		} else {
			this.calcInvestigation(this.sim, form);
		}

	},
	cycle: function(startOfRange, endOfRange) {
		//The starting CPI value of this cycle, for comparison throughout the cycle.
		var startCPI = Market[startOfRange.toString()].cpi;
		var cyc = [];
		for (var year = startOfRange; year < endOfRange; year++) {
			data = Market[year.toString()];
			cyc.push({
				"year": year,
				"data": data,
				"portfolio": {
					"start": null,
					"end": null,
					"infAdjStart": null,
					"infAdjEnd": null,
					"fees": null
				},
				"spending": null,
				"infAdjSpending": null,
				"equities": {
					"start": null,
					"growth": null,
					"val": null
				},
				"bonds": {
					"start": null,
					"growth": null,
					"val": null
				},
				"gold": {
					"start": null,
					"growth": null,
					"val": null
				},
				"cash": {
					"start": null,
					"growth": null,
					"val": null
				},
				"dividends": {
					"growth": null,
					"val": null
				},
				"cumulativeInflation": this.cumulativeInflation(startCPI, data.cpi),
				"cape": data.cape,
				"socialSecurityAndPensionAdjustments": null,
				"sumOfAdjustments": null,
			});
		}

		return cyc;

	},
	roundTwoDecimals: function(num) {
		return +parseFloat(num).toFixed(2);
	},
	cumulativeInflation: function(startCPI, endCPI) {
		return 1 + ((endCPI - startCPI) / startCPI);
	},
	calcStartPortfolio: function(form, i, j) {
		if (j > 0) {
			this.sim[i][j].portfolio.start = this.roundTwoDecimals(this.sim[i][(j - 1)].portfolio.end);
		} else {
			this.sim[i][j].portfolio.start = this.roundTwoDecimals(form.portfolio.initial);
		}
		this.sim[i][j].portfolio.infAdjStart = this.roundTwoDecimals(this.sim[i][j].portfolio.start / this.sim[i][j].cumulativeInflation);
	},
	calcSpending: function(form, i, j) {
		var spending;
		var currentYear = new Date().getFullYear();
		if (j >= (form.retirementStartYear - currentYear)) {
			spending = this.roundTwoDecimals(SpendingModule[form.spending.method].calcSpending(form, this.sim, i, j));
		} else {
			spending = 0;
		}

		this.sim[i][j].spending = spending; //assign value to main sim container
		this.sim[i][j].infAdjSpending = this.roundTwoDecimals(spending / this.sim[i][j].cumulativeInflation);
	},
	calcAllocation: function(form, i, j) {
		var ret = {
			"equities": null,
			"bonds": null,
			"gold": null,
			"cash": null
		};
		switch (form.portfolio.rebalanceAnnually) {
			case 0: //no rebalance
				if (j > 0) {
					var prev = j - 1;
					ret.equities = this.sim[i][prev].equities.end / this.sim[i][prev].portfolio.end;
					ret.bonds = this.sim[i][prev].bonds.end / this.sim[i][prev].portfolio.end;
					ret.gold = this.sim[i][prev].gold.end / this.sim[i][prev].portfolio.end;
					ret.cash = this.sim[i][prev].cash.end / this.sim[i][prev].portfolio.end;
				} else {
					ret.equities = form.portfolio.percentEquities / 100;
					ret.bonds = form.portfolio.percentBonds / 100;
					ret.gold = form.portfolio.percentGold / 100;
					ret.cash = form.portfolio.percentCash / 100;
				}
				break;
			case 1: //constant
				ret.equities = form.portfolio.percentEquities / 100;
				ret.bonds = form.portfolio.percentBonds / 100;
				ret.gold = form.portfolio.percentGold / 100;
				ret.cash = form.portfolio.percentCash / 100;
				break;
			case 2: //Glide path logic
				var currentYear = new Date().getFullYear();
				var range = {
					"start": (form.portfolio.changeAllocationStartYear - currentYear),
					"end": (form.portfolio.changeAllocationEndYear - currentYear),
					"total": null
				};
				range.total = range.end - range.start;
				if (j >= range.start && j <= range.end) { //This smooths the transition from one allocation level to another, by equal increments over the course of the entire time range.
					var allocationStep = j - range.start;
					ret.equities = parseFloat(form.portfolio.percentEquities - (((form.portfolio.percentEquities - form.portfolio.targetPercentEquities) / range.total) * allocationStep)) / 100;
					ret.bonds = parseFloat(form.portfolio.percentBonds - (((form.portfolio.percentBonds - form.portfolio.targetPercentBonds) / range.total) * allocationStep)) / 100;
					ret.gold = parseFloat(form.portfolio.percentGold - (((form.portfolio.percentGold - form.portfolio.targetPercentGold) / range.total) * allocationStep)) / 100;
					ret.cash = parseFloat(form.portfolio.percentCash - (((form.portfolio.percentCash - form.portfolio.targetPercentCash) / range.total) * allocationStep)) / 100;
				}
				if (j < range.start) {
					ret.equities = form.portfolio.percentEquities / 100;
					ret.bonds = form.portfolio.percentBonds / 100;
					ret.gold = form.portfolio.percentGold / 100;
					ret.cash = form.portfolio.percentCash / 100;
				}
				if (j > range.end) { //If beyond the end range of allocation change, continue at the allocation target that was designated.
					ret.equities = form.portfolio.targetPercentEquities / 100;
					ret.bonds = form.portfolio.targetPercentBonds / 100;
					ret.gold = form.portfolio.targetPercentGold / 100;
					ret.cash = form.portfolio.targetPercentCash / 100;
				}
				break;
			case 3: //Bonds First (Cash>Gold>Bonds>Equities)
				if (j>0){
					var prev = j - 1;
					var pot = {
						'equities': this.sim[i][prev].equities.end,
						'bonds': this.sim[i][prev].bonds.end,
						'gold': this.sim[i][prev].gold.end,
						'cash': this.sim[i][prev].cash.end
					}
					var change = this.sim[i][j].sumOfAdjustments - this.sim[i][j].spending
					pot.cash = pot.cash + change
					if (pot.cash < 0){
						pot.gold = pot.gold + pot.cash
						pot.cash = 0
					}
					if (pot.gold < 0){
						pot.bonds = pot.bonds + pot.gold
						pot.gold = 0
					}
					if (pot.bonds < 0){
						pot.equities = pot.equities + pot.bonds
						pot.bonds = 0
					}
					ret.equities = pot.equities / (this.sim[i][j].portfolio.start);
					ret.bonds = pot.bonds / (this.sim[i][j].portfolio.start);
					ret.gold = pot.gold / (this.sim[i][j].portfolio.start);
					ret.cash = pot.cash / (this.sim[i][j].portfolio.start);
				} else {
					ret.equities = form.portfolio.percentEquities / 100;
					ret.bonds = form.portfolio.percentBonds / 100;
					ret.gold = form.portfolio.percentGold / 100;
					ret.cash = form.portfolio.percentCash / 100;
				}
				break;
			case 4: //OmegaNot
				if (j>0){
					var prev = j - 1;
					var targetvalues = {
						"equities": this.sim[i][j].cumulativeInflation* form.portfolio.initial * form.portfolio.percentEquities / 100,
						"safe": this.sim[i][j].cumulativeInflation* form.portfolio.initial * (100-form.portfolio.percentEquities) / 100,
					};
					var currentequities
					var totalsafe = this.sim[i][prev].bonds.end + this.sim[i][prev].gold.end + this.sim[i][prev].cash.end
					if (this.sim[i][prev].equities.end > targetvalues.equities){ // equities are doing well
						// remove spending from equities
						currentequities = this.sim[i][prev].equities.end - this.sim[i][j].spending + this.sim[i][j].sumOfAdjustments
					} else { // equities are doing poorly
						// leave equities alone
						currentequities = this.sim[i][prev].equities.end
						// remove spending from other assets
						totalsafe = totalsafe  - this.sim[i][j].spending + this.sim[i][j].sumOfAdjustments
						if (totalsafe < 0){
							// ran out of safe assets, need to spend equities anyway.
							currentequities = currentequities + totalsafe
							totalsafe = 0
						}
					}
					ret.equities = currentequities / this.sim[i][j].portfolio.start;
					ret.bonds = totalsafe * form.portfolio.percentBonds / (this.sim[i][j].portfolio.start * (100- form.portfolio.percentEquities));
					ret.gold = totalsafe * form.portfolio.percentGold / (this.sim[i][j].portfolio.start * (100- form.portfolio.percentEquities));
					ret.cash = totalsafe * form.portfolio.percentCash / (this.sim[i][j].portfolio.start * (100- form.portfolio.percentEquities));
				} else {
					ret.equities = form.portfolio.percentEquities / 100;
					ret.bonds = form.portfolio.percentBonds / 100;
					ret.gold = form.portfolio.percentGold / 100;
					ret.cash = form.portfolio.percentCash / 100;
				}
		}
		return ret;
	},
	calcMarketGains: function(form, i, j) {
		var portfolio = this.sim[i][j].portfolio.start;
		var sumOfAdjustments = this.sim[i][j].sumOfAdjustments; //Sum of all portfolio adjustments for this given year. SS/Pensions/Extra Income/Extra Spending.
		portfolio = this.roundTwoDecimals(portfolio - this.sim[i][j].spending + sumOfAdjustments); //Take out spending and portfolio adjustments before calculating asset allocation. This simulates taking your spending out at the beginning of a year.
		this.sim[i][j].portfolio.start = portfolio;
		//Calculate value of each asset class based on allocation percentages
		var allocation = this.calcAllocation(form, i, j);
		this.sim[i][j].equities.start = (allocation.equities * portfolio);
		this.sim[i][j].bonds.start = (allocation.bonds * portfolio);
		this.sim[i][j].gold.start = (allocation.gold * portfolio);
		this.sim[i][j].cash.start = (allocation.cash * portfolio);

		//Calculate growth
		if (form.data.method == "constant") {
			this.sim[i][j].equities.growth = this.roundTwoDecimals(this.sim[i][j].equities.start * (parseFloat(form.data.growth) / 100));
			this.sim[i][j].dividends.growth = 0;
			this.sim[i][j].bonds.growth = this.roundTwoDecimals(this.sim[i][j].bonds.start * (parseFloat(form.data.growth) / 100));
			this.sim[i][j].gold.growth = this.roundTwoDecimals(this.sim[i][j].gold.start * (parseFloat(form.data.growth) / 100));
			this.sim[i][j].cash.growth = this.roundTwoDecimals(this.sim[i][j].cash.start * ((form.portfolio.growthOfCash / 100)));
		} else {
			this.sim[i][j].equities.growth = this.roundTwoDecimals(this.sim[i][j].equities.start * (this.sim[i][j].data.growth));
			this.sim[i][j].dividends.growth = this.roundTwoDecimals(this.sim[i][j].equities.start * this.sim[i][j].data.dividends);

			//New Bond Calculation to incorporate capital appreciation.
			if (typeof(Market[this.sim[i][j].year + 1]) == "undefined") {
				this.sim[i][j].bonds.growth = this.roundTwoDecimals(this.sim[i][j].bonds.start * (this.sim[i][j].data.fixed_income));
			} else {
				var bondsGrowth1 = (this.sim[i][j].data.fixed_income) * (1 - (Math.pow((1 + Market[this.sim[i][j].year + 1].fixed_income), (-9)))) / Market[this.sim[i][j].year + 1].fixed_income;
				var bondsGrowth2 = (1 / (Math.pow((1 + Market[this.sim[i][j].year + 1].fixed_income), 9))) - 1;
				this.sim[i][j].bonds.growth = this.roundTwoDecimals(this.sim[i][j].bonds.start * (bondsGrowth1 + bondsGrowth2 + this.sim[i][j].data.fixed_income));
			}

			this.sim[i][j].gold.growth = this.roundTwoDecimals(this.sim[i][j].gold.start * (this.sim[i][j].data.gold));
			this.sim[i][j].cash.growth = this.roundTwoDecimals(this.sim[i][j].cash.start * ((form.portfolio.growthOfCash / 100)));
		}

		//Calculate total value
		this.sim[i][j].equities.end = this.roundTwoDecimals(this.sim[i][j].equities.start + this.sim[i][j].equities.growth + this.sim[i][j].dividends.growth);
		this.sim[i][j].dividends.val = this.sim[i][j].dividends.growth;
		this.sim[i][j].bonds.end = this.roundTwoDecimals(this.sim[i][j].bonds.start + this.sim[i][j].bonds.growth);
		this.sim[i][j].gold.end = this.roundTwoDecimals(this.sim[i][j].gold.start + this.sim[i][j].gold.growth);
		this.sim[i][j].cash.end = this.roundTwoDecimals(this.sim[i][j].cash.start + this.sim[i][j].cash.growth);
	},
	calcEndPortfolio: function(form, i, j) {
		var feesIncurred = this.roundTwoDecimals((this.sim[i][j].portfolio.start + this.sim[i][j].equities.growth + this.sim[i][j].bonds.growth + this.sim[i][j].cash.growth + this.sim[i][j].gold.growth) * (form.portfolio.percentFees / 100));
		this.sim[i][j].portfolio.fees = feesIncurred;

		//Calculate current allocation percentages after all market gains are taken into consideration
		var totalEnd = this.sim[i][j].equities.end + this.sim[i][j].bonds.end + this.sim[i][j].cash.end + this.sim[i][j].gold.end;
		var curPercEquities = this.sim[i][j].equities.end / totalEnd;
		var currPercCash = this.sim[i][j].cash.end / totalEnd;
		var currPercBonds = this.sim[i][j].bonds.end / totalEnd;
		var currPercGold = this.sim[i][j].gold.end / totalEnd;

		//Equally distribute fees and portoflio adjustments amongst portfolio based on allocation percentages
		this.sim[i][j].equities.end = this.roundTwoDecimals(this.sim[i][j].equities.end - (curPercEquities * feesIncurred));
		this.sim[i][j].cash.end = this.roundTwoDecimals(this.sim[i][j].cash.end - (currPercCash * feesIncurred));
		this.sim[i][j].bonds.end = this.roundTwoDecimals(this.sim[i][j].bonds.end - (currPercBonds * feesIncurred));
		this.sim[i][j].gold.end = this.roundTwoDecimals(this.sim[i][j].gold.end - (currPercGold * feesIncurred));

		//Sum all assets to determine portfolio end value.
		totalEnd = this.sim[i][j].equities.end + this.sim[i][j].bonds.end + this.sim[i][j].cash.end + this.sim[i][j].gold.end;
		this.sim[i][j].portfolio.end = !isNaN(totalEnd) ? this.roundTwoDecimals(totalEnd) : 0;
		this.sim[i][j].portfolio.infAdjEnd = this.roundTwoDecimals(this.sim[i][j].portfolio.end / this.sim[i][j].cumulativeInflation);
	},
	calcFailures: function(results) {
		var totalFailures = 0;
		for (var i = 0; i < results.length; i++) {
			var cycleFailure = false;
			for (var j = 0; j < results[i].length; j++) {
				if (results[i][j].portfolio.end < 0) {
					cycleFailure = true;
				}
			}
			if (cycleFailure == true) {
				totalFailures++;
			}
		}
		var ret = {
			'totalFailures': totalFailures,
			'totalCycles': results.length
		};
		return ret;
	},
	calcSumOfAdjustments: function(form, i, j) { //Calculate the sum of all portfolio adjustments for a given year (pensions, extra income, extra spending, etc)
		var currentYear = new Date().getFullYear();
		var socialSecurityAndPensionAdjustments = 0;
		var sumOfAdjustments = 0;
		//Evaluate ExtraIncome given cycle i, year j
		//Social Security - always adjusted by CPI
		if ((j >= (form.extraIncome.socialSecurity.startYear - currentYear)) && (j <= (form.extraIncome.socialSecurity.endYear - currentYear))) {
			socialSecurityAndPensionAdjustments += (form.extraIncome.socialSecurity.val * this.sim[i][j].cumulativeInflation);
		}
		if ((j >= (form.extraIncome.socialSecuritySpouse.startYear - currentYear)) && (j <= (form.extraIncome.socialSecuritySpouse.endYear - currentYear))) {
			socialSecurityAndPensionAdjustments += (form.extraIncome.socialSecuritySpouse.val * this.sim[i][j].cumulativeInflation);
		}

		//Pensions
		for (var k = 0; k < form.extraIncome.pensions.length; k++) {
			if ((j >= (form.extraIncome.pensions[k].startYear - currentYear))) {
				socialSecurityAndPensionAdjustments += this.calcAdjustmentVal(form.extraIncome.pensions[k], i, j);
			}
		}

		sumOfAdjustments += socialSecurityAndPensionAdjustments;
		//Extra Savings
		for (var k = 0; k < form.extraIncome.extraSavings.length; k++) {
			if (form.extraIncome.extraSavings[k].recurring == true) {
				if ((j >= (form.extraIncome.extraSavings[k].startYear - currentYear)) && (j <= (form.extraIncome.extraSavings[k].endYear - currentYear))) {
					sumOfAdjustments += this.calcAdjustmentVal(form.extraIncome.extraSavings[k], i, j);
				}
			} else if (form.extraIncome.extraSavings[k].recurring == false) {
				if (j == (form.extraIncome.extraSavings[k].startYear - currentYear)) {
					sumOfAdjustments += this.calcAdjustmentVal(form.extraIncome.extraSavings[k], i, j);
				}
			}
		}

		//Evaluate ExtraSpending
		for (var k = 0; k < form.extraSpending.length; k++) {
			if (form.extraSpending[k].recurring == true) {
				if ((j >= (form.extraSpending[k].startYear - currentYear)) && (j <= (form.extraSpending[k].endYear - currentYear))) {
					sumOfAdjustments -= this.calcAdjustmentVal(form.extraSpending[k], i, j);
				}
			} else if (form.extraSpending[k].recurring == false) {
				if (j == (form.extraSpending[k].startYear - currentYear)) {
					sumOfAdjustments -= this.calcAdjustmentVal(form.extraSpending[k], i, j);
				}
			}
		}

		//Add sumOfAdjustments to sim container and return value.
		this.sim[i][j].socialSecurityAndPensionAdjustments = socialSecurityAndPensionAdjustments;
		this.sim[i][j].sumOfAdjustments = sumOfAdjustments;
		return sumOfAdjustments;
	},
	calcAdjustmentVal: function(adj, i, j) {
		//Take in parameter of a portfolio adjustment object, return correct inflation-adjusted amount based on object parameters
		if (adj.inflationAdjusted == true) {
			if (adj.inflationType == "CPI") {
				return (adj.val * this.sim[i][j].cumulativeInflation);
			} else if (adj.inflationType == "constant") {
				var percentage = 1 + (adj.inflationRate / 100);
				return (adj.val * Math.pow(percentage, (j + 1)));
			}
		} else if (adj.inflationAdjusted == false) {
			return parseFloat(adj.val);
		}
	},
	calcInvestigation: function(sim, form) {
		if (form.investigate.type == 'maxInitialSpending') {
			var min = 0,
				max = 1000000;
			while (min+0.1 <= max) {
				var mid = ((max - min) / 2) + min;
				form.spending.initial = mid;
				for (var i = 0; i < this.sim.length; i++) {
					for (var j = 0; j < this.sim[i].length; j++) {
						this.calcStartPortfolio(form, i, j); //Return Starting portfolio value to kick off yearly simulation cycles
						this.calcSumOfAdjustments(form, i, j);
						this.calcSpending(form, i, j); //Nominal spending for this specific cycle
						this.calcMarketGains(form, i, j); //Calculate market gains on portfolio based on allocation from form and data points
						this.calcEndPortfolio(form, i, j); //Sum up ending portfolio
					}
				}
				var failures = this.calcFailures(this.sim);
				var success = (failures.totalCycles - failures.totalFailures) / failures.totalCycles;
				if (success < (form.investigate.successRate / 100)) {
					max = mid;
				} else {
					min = mid;
				}
				if ((max - min) > .5) {
					continue;
				} else {
					var html = "<b>Investigate Maximum Initial Spending</b>: Considering all other inputs, the maximum initial spending would be <b style='color:#AAFF69'>" + accounting.formatMoney(Math.floor(mid), "$", 0) + "</b>.";
					//Run post-simulation functions
					this.convertToCSV(this.sim);
					this.calcFailures(this.sim);
					this.displayGraph(this.sim, form);

					//Initialize statistics calculations
					StatsModule.init(this.sim, form);

					//Display Investigation Results
					$("#graph" + Simulation.tabs).parent().prepend(html);
					break;
				}
			}
		} else if (form.investigate.type == 'retirementYear') {
			var min = form.simulationStartYear,
				max = form.retirementEndYear;
			while (min <= max) {
				form.retirementStartYear = min;
				for (var i = 0; i < this.sim.length; i++) {
					for (var j = 0; j < this.sim[i].length; j++) {
						this.calcStartPortfolio(form, i, j); //Return Starting portfolio value to kick off yearly simulation cycles
						this.calcSumOfAdjustments(form, i, j);
						this.calcSpending(form, i, j); //Nominal spending for this specific cycle
						this.calcMarketGains(form, i, j); //Calculate market gains on portfolio based on allocation from form and data points
						this.calcEndPortfolio(form, i, j); //Sum up ending portfolio
					}
				}
				var failures = this.calcFailures(this.sim);
				var success = (failures.totalCycles - failures.totalFailures) / failures.totalCycles;
				if (success < (form.investigate.successRate / 100)) {
					min++;
				} else {
					var html = "<b>Investigate Retirement Year</b>: Considering all other inputs, the earliest retirement year would be <b style='color:#AAFF69'>" + min + "</b>.";
					//Run post-simulation functions
					this.convertToCSV(this.sim);
					this.calcFailures(this.sim);
					this.displayGraph(this.sim, form);

					//Initialize statistics calculations
					StatsModule.init(this.sim, form);

					//Display Investigation Results
					$("#graph" + Simulation.tabs).parent().prepend(html);
					break;
				}
			}
		}
	},
	displayGraph: function(results, form) {
		var chartData = [];
		var spendingData = [];
		var interval = results.length;
		var cycLength = results[0].length;
		var simLength = results[results.length-1][cycLength-1]["year"] - results[0][0]["year"] +1;

		//Logic to create array for Dygraphs display. Each series must have an entry for every year in the dataset. If there is no entry for that year in the "results" array, a null value is given so that dygraphs doesn't plot there. This provides the unique look of cFIREsims graph
		for (var i = 0; i < simLength; i++) {
			chartData.push([]);
			spendingData.push([]);
			for (var j = 0; j < interval; j++) {
				chartData[i].push(null);
				spendingData[i].push(null);
			}
		}
		for (var i = 0; i < simLength; i++) {
			for (var j = 0; j < results.length; j++) {
				for (var k = 0; k < cycLength; k++) {
					if (results[j][k].year == (i + results[0][0].year)) {
						chartData[i][j] = results[j][k].portfolio.infAdjEnd;
						spendingData[i][j] = results[j][k].infAdjSpending;
					}
				}
			}
		}

		for (var i = 0; i < simLength; i++) { // Add year to the front of each series array. This is a Dygraphs format standard
			chartData[i].unshift((i + results[0][0].year));
		}
		for (var i = 0; i < simLength; i++) { // Add year to the front of each series array. This is a Dygraphs format standard
			spendingData[i].unshift((i + results[0][0].year));
		}

		//Chart Formatting - Dygraphs
		var labels = ['x'];
		for (var i = 0; i < results.length; i++) {
			var labelyear = i + results[0][0].year;
			var label = '';
			label = 'Cycle Start Year: ' + labelyear;
			labels[i + 1] = label;
		}

		//Chart Series Colors Formatter
		function rainbowColors(length, maxLength) {
			var i = (length * 255 / maxLength);
			var r = Math.round(Math.sin(0.024 * i + 0) * 127 + 128);
			var g = Math.round(Math.sin(0.024 * i + 2) * 127 + 128);
			var b = Math.round(Math.sin(0.024 * i + 4) * 127 + 128);
			return 'rgb(' + r + ',' + g + ',' + b + ')';
		}
		var colors = [];
		for (var i = 0; i < results.length; i++) {
			colors.push(rainbowColors(i, results.length));
		}

		//Portfolio Graph
		Simulation.g.push(new Dygraph(
			// containing div
			document.getElementById("graph" + Simulation.tabs),
			chartData, {
				labels: labels.slice(),
				legend: 'always',
				title: 'cFIREsim Simulation Cycles',
				ylabel: 'Portfolio ($)',
				xlabel: 'Year',
				labelsDivStyles: {
					'textAlign': 'right'
				},
				labelsDivWidth: 500,
				labelsDiv: 'labels' + Simulation.tabs,
				digitsAfterDecimal: 0,
				axes: {
					y: {
						axisLabelWidth: 100,
						labelsKMB: false,
						maxNumberWidth: 11,
						valueFormatter: function numberWithCommas(x) {
							return 'Portfolio: $' + x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
						},
						axisLabelFormatter: function numberWithCommas(x) {
							return '$' + x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
						}
					},
					x: {
						valueFormatter: function numberWithCommas(x) {
							return 'Year: ' + x;
						},
					},
				},
				colors: colors,
				showLabelsOnHighlight: true,
				highlightCircleSize: 3,
				strokeWidth: 1.5,
				strokeBorderWidth: 0,
				highlightSeriesBackgroundAlpha: 1.0,
				highlightSeriesOpts: {
					strokeWidth: 4,
					strokeBorderWidth: 2,
					highlightCircleSize: 7,
				},
			}
		));



		//Spending Graph
		Simulation.g.push(new Dygraph(
			// containing div
			document.getElementById("graph" + Simulation.tabs + "b"),
			spendingData, {
				labels: labels.slice(),
				legend: 'always',
				title: 'Spending Level',
				ylabel: 'Spending ($)',
				xlabel: 'Year',
				labelsDivStyles: {
					'textAlign': 'right'
				},
				labelsDiv: 'labels' + Simulation.tabs + "b",
				labelsDivWidth: 500,
				digitsAfterDecimal: 0,
				axes: {
					y: {
						axisLabelWidth: 100,
						labelsKMB: false,
                        includeZero: true,
						maxNumberWidth: 11,
						valueFormatter: function numberWithCommas(x) {
							return 'Spending: $' + x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
						},
						axisLabelFormatter: function numberWithCommas(x) {
							return '$' + x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
						}
					},
					x: {
						valueFormatter: function numberWithCommas(x) {
							return 'Year: ' + x;
						},
					},
				},
				colors: colors,
				showLabelsOnHighlight: true,
				highlightCircleSize: 3,
				strokeWidth: 1.5,
				strokeBorderWidth: 0,
				highlightSeriesBackgroundAlpha: 1.0,
				highlightSeriesOpts: {
					strokeWidth: 4,
					strokeBorderWidth: 2,
					highlightCircleSize: 5,
				},
			}
		));

		$('#tabNav a[href="#' + Simulation.tabs + 'a"]').tab('show');
		$('a[href="#' + Simulation.tabs + 'a"]').parent('li').show();
		$('#showPreviousSimulations').show();
	},
	convertToCSV: function(results) { //converts a random cycle of simulation into a CSV file, for users to easily view
		var csv = "";
		/*
		//Random number generator for supplying a CSV of only 1 random cycle. Disabled for debugging purposes.
		function getRandomInt(min, max) {
			return Math.floor(Math.random() * (max - min)) + min;
		}
		var num = getRandomInt(0, results.length);
		*/
		var tmpStr = "";
		for (var j = 0; j < results.length; j++) {
			csv = csv.concat("Year,CumulativeInflation,portfolio.start,portfolio.infAdjStart,spending,infAdjSpending,PortfolioAdjustments,Equities,Bonds,Gold,Cash,equities.growth,dividends,bonds.growth,gold.growth,cash.growth,fees,portfolio.end,portfolio.infAdjEnd\r\n");
			for (var i = 0; i < results[j].length; i++) {
				csv = csv.concat(results[j][i].year + ",");
				csv = csv.concat(results[j][i].cumulativeInflation + ",");
				csv = csv.concat(results[j][i].portfolio.start + ",");
				csv = csv.concat(results[j][i].portfolio.infAdjStart + ",");
				csv = csv.concat(results[j][i].spending + ",");
				csv = csv.concat(results[j][i].infAdjSpending + ",");
				csv = csv.concat(results[j][i].sumOfAdjustments + ",");
				csv = csv.concat(results[j][i].equities.start + ",");
				csv = csv.concat(results[j][i].bonds.start + ",");
				csv = csv.concat(results[j][i].gold.start + ",");
				csv = csv.concat(results[j][i].cash.start + ",");
				csv = csv.concat(results[j][i].equities.growth + ",");
				csv = csv.concat(results[j][i].dividends.growth + ",");
				csv = csv.concat(results[j][i].bonds.growth + ",");
				csv = csv.concat(results[j][i].gold.growth + ",");
				csv = csv.concat(results[j][i].cash.growth + ",");
				csv = csv.concat(results[j][i].portfolio.fees + ",");
				csv = csv.concat(results[j][i].portfolio.end + ",");
				csv = csv.concat(results[j][i].portfolio.infAdjEnd + ",");
				csv = csv.concat("\r\n");
				if (i == results[j].length - 1) {
					tmpStr = tmpStr.concat(results[j][i].portfolio.infAdjEnd + ",");

				}
			}
			csv = csv.concat("Year,CumulativeInflation,portfolio.start,portfolio.infAdjStart,spending,infAdjSpending,PortfolioAdjustments,Equities,Bonds,Gold,Cash,equities.growth,dividends,bonds.growth,gold.growth,cash.growth,fees,portfolio.end,portfolio.infAdjEnd\r\n\r\n");

		}

		var uri = 'data:text/csv;charset=utf-8,' + escape(csv);
		// Now the little tricky part.
		// you can use either>> window.open(uri);
		// but this will not work in some browsers
		// or you will not get the correct file extension

		// See if the link already exists and if it does, delete it.
		var oldLink = document.getElementById("csvDownloadLink");
		if (oldLink !== null) {
			oldLink.parentNode.removeChild(oldLink);
		}
		//this trick will generate a temp <a /> tag
		var link = document.createElement("a");
		var linkText = document.createTextNode("Download Year-by-year Spreadsheet");
		link.title = "Download Year-by-year Spreadsheet";
		// Add an id to the link to be able to remove it
		link.id = "csvDownloadLink";
		link.appendChild(linkText);
		link.href = uri;

		//set the visibility hidden so it will not effect on your web-layout
		//link.style = "visibility:hidden";
		link.download = "cfiresim.csv";

		//this part will append the anchor tag and remove it after automatic click
		document.body.appendChild(link);
		$(link).appendTo("#download" + Simulation.tabs);
		$(link).addClass("btn btn-success btn-lg");
		//link.click();
		//document.body.removeChild(link);
	},
	getUrlVars: function() { //Function to retrieve GET parameters in URL. Used in loading saved sim via URL.
		var vars = {};
		var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
			vars[key] = parseInt(value);
		});
		return vars.id;
	}
};
