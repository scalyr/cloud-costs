var SECONDS_PER_YEAR = 31556926;
var HOURS_PER_YEAR   = SECONDS_PER_YEAR / 3600;
var HOURS_PER_MONTH  = HOURS_PER_YEAR / 12;
var DAYS_PER_MONTH   = HOURS_PER_MONTH / 24;

var serverCostsScope;

function defaultTerms() { return [
    {name: "Hour",    label: "1 Hour",  checked: false},
    {name: "Month",   label: "1 Month", checked: false},
    {name: "Year",    label: "1 Year",  checked: false},
    {name: "3 Years", label: "3 Years", checked: false}
  ];
}

var ServerCostsController = function ServerCostsController($scope, $filter) {
  serverCostsScope = $scope;
  
  // Find all provider and region values in the database.
  $scope.providers = getChoices("provider");
  $scope.regions = getChoices("region");
	
  // Build a list of lease terms. Here we make an explicit list, rather than finding unique values
  // in the database, (a) because alphabetical order is not appropriate here, and (b) to add the
  // "label" attribute.
  $scope.terms = defaultTerms();
	  
  // Create an array of objects, one per entry in serverChoices. We'll use this to ensure that
  // filteredServerChoices always returns the same objects; otherwise Angular gets confused,
  // because it doesn't understand that different objects are equivalent if they have the same fields.
  $scope.objectCache = [];
  for (var i in serverChoices)
	  $scope.objectCache.push({});
	  
  // Specify default form values and sorting order.
  $scope.hoursPerDay = 24;
  $scope.lifetimeInMonths = 1;
  $scope.costOfFunds = 10;
  $scope.ec2ResalePercent = 100;
  $scope.display = "absolute";
  $scope.sort = [{field: "amortizedCost", ascending: true}, {field: "upfrontCost", ascending: true}];
	  
  // By default, limit to North America / Hourly + Monthly, to bound the number of choices.
  for (var i in $scope.regions)
	  if ($scope.regions[i].name == "N. America")
		  $scope.regions[i].checked = true;
  
  // By default, exclude the "Other" provider... since it's a joke. :)
  for (var i in $scope.providers)
	  if ($scope.providers[i].name != "Other")
		  $scope.providers[i].checked = true;
	
  // Define some functions and values for use in Angular directives.
  $scope.formatDollars = formatDollars;
  $scope.formatTwoDecimalsMaybeRelative = function(value) { return maybeRelative(formatTwoDecimals(value), " cores/$", $scope);	}; 
  $scope.formatThreeDecimalsMaybeRelative = function(value) { return maybeRelative(formatThreeDecimals(value), " cores/$", $scope);	}; 
	$scope.formatMBMaybeRelative = function(value) { return maybeRelative(formatMB(value), "/$", $scope); };
  $scope.buildTableBodyHtml = function() { return buildTableBodyHtml($scope, $filter); }
  $scope.filteredServerChoices = function() { return filteredServerChoices($scope, $filter); }
  $scope.setSort = function(sortColumn) { setSort($scope, sortColumn); }
  $scope.sortHeaderClass = function(sortColumn) { return sortHeaderClass($scope, sortColumn); }
  $scope.applyPreset = applyPreset;
  
  $scope.choiceCount = serverChoices.length;
  $scope.numberFormat = /^[0-9.]+$/;
  
  // Specify table columns.
  $scope.columns = [
    {field: "provider", title: "Provider", tooltip: "Cloud provider offering this server"},
    {field: "serverType", title: "Server Type", tooltip: "Server size / type"},
    {field: "cores", title: "Cores", tooltip: "Approximate number of \"equivalent\" CPU cores (see blog post)"},
    {field: "ramMB", title: "RAM", tooltip: "Server RAM"},
    {field: "diskMB", title: "Disk", tooltip: "Attached disk storage (excludes SSD)"},
    {field: "flashMB", title: "SSD", tooltip: "Attached SSD storage"},
    {field: "amortizedCost", title: "$/Month", tooltip: "Effective cost per month (amortized)"},
    {field: "reservationType", title: "Lease Type", tooltip: "Reservation / lease type for this price"},
    {field: "upfrontCost", title: "Upfront", tooltip: "Up-front cost (if any) per lease term"},
    {field: "hourlyCost", title: "Hourly", tooltip: "Hourly usage fee (if any)"},
    {field: "location", title: "Location", tooltip: "Geographic region"}
  ];
  
  /* Beginnings of an attempt to synchronized our state with the browser location, so that
     search results could be bookmarked.
  $locationProvider.html5Mode(true);
  $scope.$watch("location", function(){
    $scope.hoursPerDay = $location.search();
  });
  
  $scope.$watch("hoursPerDay", function(){
    $location.search($scope.hoursPerDay);
  });
  */
}

ServerCostsController.$inject = [ '$scope', '$filter'];


// Set choice.amortizedCost to the cost of the given choice, in dollars per month. This computation
// is based on attributes of the choice record (upfrontCost, hourlyCost, termMonths) as well as form
// parameters (e.g. costOfFunds).
// 
// If the user has selected per-dollar display, we also convert the relevant fields (cores, ramMB, etc.)
// to per-dollar values.
function updateAmortizedCost($scope, choice) {
  var hoursPerDay      = $scope.hoursPerDay;
  var lifetimeInMonths = $scope.lifetimeInMonths;
  var costOfFunds      = $scope.costOfFunds || 0;
  var ec2ResalePercent = $scope.ec2ResalePercent || 0;
  
  // If hoursPerDay or lifetimeInMonths aren't specified (or are <= 0), we can't make a useful computation.
  if (!hoursPerDay || !lifetimeInMonths || hoursPerDay <= 0 || lifetimeInMonths <= 0) {
	  choice.amortizedCost = 0;
	  return;
  }
  
  // Determine how much we'll pay up front (as net-present-value). If lifetimeInMonths is greater than the
  // lease period, we'll need to make several "up front" payments.
  var totalCost = 0;
  if (choice.upfrontCost > 0) {
	  for (var monthIndex = 0; monthIndex < lifetimeInMonths; monthIndex += choice.termMonths)
  		totalCost += presentValue(choice.upfrontCost, monthIndex, costOfFunds);
    
    if (choice.provider == "Amazon") {
  	  // Allow for resale of any leftover months in a reserved instance.
  	  var leftoverMonths = choice.termMonths - (lifetimeInMonths % choice.termMonths); 
  	  if (leftoverMonths < choice.termMonths) {
      	  var proratedValue = choice.upfrontCost * leftoverMonths / choice.termMonths;
      	  var resalePrice = proratedValue * ec2ResalePercent / 100;
      	  totalCost -= presentValue(resalePrice * 0.9, 1, lifetimeInMonths, costOfFunds); // multiply by 0.9 to allow for Amazon's 10% resale fee
  	  }
    }
  }
  
  // Determine how much we'll pay in hourly fees, again as net-present-value. Note that Digital Ocean
  // charges for at most 672 hours (28 days) per month.
  var billedHoursPerMonth = hoursPerDay * DAYS_PER_MONTH;
  if (choice.provider == "Digital Ocean")
  	billedHoursPerMonth = Math.min(billedHoursPerMonth, 672);
  
	for (var monthIndex = 0; monthIndex < lifetimeInMonths; monthIndex++)
		totalCost += presentValue(billedHoursPerMonth * choice.hourlyCost, monthIndex, costOfFunds);
		
	choice.amortizedCost = amortize(totalCost, lifetimeInMonths, costOfFunds / 12);
  
  if (choice.amortizedCost > 0 && $scope.display == "relative") {
	  // Convert system attributes to per-monthly-dollar.
	  choice.cores /= choice.amortizedCost;
	  choice.ramMB /= choice.amortizedCost;
	  choice.diskMB /= choice.amortizedCost;
	  choice.flashMB /= choice.amortizedCost;
  }
}
  
// Return the value today, of the specified amount of money the at the given future date, based
// on the given annual interest rate (in percent). We compute interest compounded monthly. 
function presentValue(futureValue, monthsInFuture, annualInterestRate) {
  var monthlyFactor = 1.0 + (annualInterestRate / 100 / 12);
  return futureValue / Math.pow(monthlyFactor, monthsInFuture);
}

// Suppose that a given cost (presentValue) is to be paid over the given number of periods, with future
// payments discounted by the given interest rate (percent) per period. Return the fixed payment per period
// which will cause the sum of the payments to have the specified present value.
function amortize(presentValue, periods, interestRate) {
  if (interestRate == 0)
	  return presentValue / periods;
  
  var p = 1 / (1 + interestRate / 100);
  return presentValue * (p - 1) / (Math.pow(p, periods) - 1);
}

// Called when the user clicks on the header for sortColumn. We update the sorting order accordingly.
function setSort($scope, sortColumn) {
  // If sortColumn is the primary sort axis, toggle ascending / descending. Otherwise add sortColumn
  // as a new primary axis. If we now have more than three sort axes, discard the oldest. 
  if ($scope.sort.length > 0 && sortColumn == $scope.sort[0].field) {
    $scope.sort[0].ascending = !$scope.sort[0].ascending;
  } else {
    $scope.sort.unshift({field: sortColumn, ascending: true});
    if ($scope.sort.length > 3) {
      $scope.sort.pop();
    }
  }
}

// Return the CSS class for a <th> used as a sortable column header. Used to highlight the current
// sort column.
function sortHeaderClass($scope, sortColumn) {
  // If sortColumn is the primary sort axis, toggle ascending / descending. Otherwise add sortColumn
  // as a new primary axis. If we now have more than three sort axes, discard the oldest. 
  if ($scope.sort.length > 0 && sortColumn == $scope.sort[0].field) {
    return ($scope.sort[0].ascending) ? "sorted-ascending" : "sorted-descending";
  } else {
    return "sorted-none";
  }
}

// Return HTML code for the innerHtml of the <tbody> tag. (Not currently used. This was an experiment
// to see whether it would be faster than using ng-repeat to build the table.)
function buildTableBodyHtml($scope, $filter) {
  var result = "";
  var serverChoices = filteredServerChoices($scope, $filter);
  for (var i in serverChoices) {
    var serverChoice = serverChoices[i];
    var row = "<tr>";
    
    row += "<td>" + entityEncode(serverChoice.provider) + "</td>";
    row += "<td>" + entityEncode(serverChoice.location) + "</td>";
    row += "<td>" + entityEncode(serverChoice.reservationType) + "</td>";
    row += "<td>" + entityEncode(serverChoice.serverType) + "</td>";
    row += "<td>" + entityEncode(formatDollars(serverChoice.upfrontCost)) + "</td>";
    row += "<td>" + entityEncode(formatDollars(serverChoice.hourlyCost)) + "</td>";
    row += "<td>" + entityEncode($scope.formatThreeDecimalsMaybeRelative(serverChoice.cores)) + "</td>";
    row += "<td>" + entityEncode($scope.formatMBMaybeRelative(serverChoice.ramMB)) + "</td>";
    row += "<td>" + entityEncode($scope.formatMBMaybeRelative(serverChoice.diskMB)) + "</td>";
    row += "<td>" + entityEncode($scope.formatMBMaybeRelative(serverChoice.flashMB)) + "</td>";
    row += "<td>" + entityEncode(formatDollars(serverChoice.amortizedCost)) + "</td>";
    
    row += "</tr>";
    result += row;
  }

  return result;
}

// Quick-and-dirty entity encoding.
function entityEncode(html) {
  return html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
}

// Return an array of objects, one for each server offering that matches the current filter criteria,
// and sorted according to the current sorting rule.
function filteredServerChoices($scope, $filter) {
  // Fetch all of the filter criteria from the form.
  var selectedProviders = getSelectedValues($filter, $scope.providers);
  var selectedRegions   = getSelectedValues($filter, $scope.regions);
  var selectedTerms     = getSelectedValues($filter, $scope.terms);
  
  var minUpfront = $scope.minUpfront, maxUpfront = $scope.maxUpfront;
  var minHourly = $scope.minHourly, maxHourly = $scope.maxHourly;
  var minCores = $scope.minCores, maxCores = $scope.maxCores;
  var minRam = $scope.minRam, maxRam = $scope.maxRam;
  var minDisk = $scope.minDisk, maxDisk = $scope.maxDisk;
  var minFlash = $scope.minFlash, maxFlash = $scope.maxFlash;
  
  // Iterate all offerings in our database, and find those that match the criteria.
  var filtered = [];
  for (var i in serverChoices) {
    var choice = $scope.objectCache[i];
    shallowCopy(serverChoices[i], choice);
    filtered.push(choice);
    
    // By default, hide this choice. We'll make it visible if we pass all of the filter tests that
    // follow. We do this, rather than simply excluding the hidden choices from the output array,
    // because destroying DOM nodes can be slow.
    choice.show = false;
    choice.amortizedCost = -1; // put a dummy value in amortizedCost; if we leave it undefined, the sort algorithm gets confused.
    
    if (selectedProviders != null && !selectedProviders[choice.provider])
      continue;
    if (selectedRegions != null && !selectedRegions[choice.region])
      continue;
    if (selectedTerms != null && !selectedTerms[choice.term])
      continue;
    
    if (!valueInRange(choice.upfrontCost, minUpfront, maxUpfront))
      continue;
    if (!valueInRange(choice.hourlyCost, minHourly, maxHourly))
      continue;
    if (!valueInRange(choice.cores, minCores, maxCores))
      continue;
    if (!valueInRange(choice.ramMB / 1024, minRam, maxRam))
      continue;
    if (!valueInRange(choice.diskMB / 1024, minDisk, maxDisk))
      continue;
    if (!valueInRange(choice.flashMB / 1024, minFlash, maxFlash))
      continue;
    
    choice.show = true;
    
    // Compute the amortized cost for this offering, according to the current form values.
    updateAmortizedCost($scope, choice);
  }
  
  // Sort the matching criteria, and return the array.
  sortChoices(filtered, $scope.sort);
  return filtered;
}

// Return true if value is in the range [min, max]. Ignore min or max values that are zero / missing.
function valueInRange(value, min, max) {
 if (min && value < min)
   return false;
 if (max && value > max)
   return false;
 return true;
}

//Copy all attributes of src to dest.
function shallowCopy(src, dest) {
  for (name in src)
    dest[name] = src[name];
}

// Return all unique values in the database for the given field, in alphabetical order, as an array of
// objects of the form {name: "xxx", checked: false}.
function getChoices(fieldName) {
  var choiceMap = {};
  for (var i in serverChoices)
	  choiceMap[serverChoices[i][fieldName]] = true;
  
  var nameArray = [];
  for (var choice in choiceMap)
	  nameArray.push(choice);
  
  nameArray.sort();
  
  var choiceArray = [];
  for (var i in nameArray)
	  choiceArray.push({name: nameArray[i], checked: false});
  return choiceArray;
}

// Given an array of server offerings, and an array of sort clauses, sort the choices array.
function sortChoices(choices, sort) {
  choices.sort(function(a, b) {
    // Sort hidden entries after non-hidden entries. Otherwise, our even row / odd row table striping breaks.
    if (a.show != b.show)
      return (a.show) ? -1 : 1;
    
	  // Try each sort clause in turn.
	  for (var sortIndex in sort) {
		  var sortClause = sort[sortIndex];
		  var aValue = a[sortClause.field], bValue = b[sortClause.field];
		  if (aValue < bValue) {
			  return sortClause.ascending ? -1 : 1;
		  } else if (aValue > bValue) {
			  return sortClause.ascending ? 1 : -1;
		  }
	  }
	  
	  return 0;
  });
}

// Return all selected (checked) values for the given option, as a map from value to true.
// If no values are selected for this option, return null.
function getSelectedValues($filter, options) {
  var map = {};
  var filtered = $filter('filter')(options, {checked: true});
  for (var i in filtered)
	  map[filtered[i].name] = true;
  
  return (filtered.length > 0) ? map : null;
}
    
// Given a dollar amount, e.g. 710 or 1.5, return a formatting string with a $ and two decimal places,
// e.g. $710.00 or $1.50. For values less than $10, we return three decimal places (this is important
// for accurately reporting per-hour costs).
function formatDollars(value) {
  if (value == 0 || value == null)
	  return "";
  
  var sign = (value < 0) ? "-" : "";
  value = Math.abs(value);
  
  if (value >= 10) {
	  var cents = Math.round(value * 100);
	  var s = "" + cents;
	  
	  if (s.length >= 9)
  	  return sign + "$" + s.substring(0, s.length - 8) + "," + s.substring(s.length - 8, s.length - 5) + "," + s.substring(s.length - 5, s.length - 2) + "." + s.substring(s.length - 2);
	  else if (s.length >= 7)
  	  return sign + "$" + s.substring(0, s.length - 5) + "," + s.substring(s.length - 5, s.length - 2) + "." + s.substring(s.length - 2);
	  else
   	  return sign + "$" + s.substring(0, s.length - 2) + "." + s.substring(s.length - 2);
  } else {
	  var tenths = Math.round(value * 1000);
	  var s = "" + tenths;
	  while (s.length < 4)
		  s = "0" + s;
  	  
	  return sign + "$" + s.substring(0, s.length - 3) + "." + s.substring(s.length - 3);
  }
}

// Return the given value, rounded to two decimal places.
function formatTwoDecimals(value) {
  return "" + Math.round(value * 100) / 100;
}

// Return the given value, rounded to three decimal places.
function formatThreeDecimals(value) {
  return "" + Math.round(value * 1000) / 1000;
}

// Given a (possibly fractional) number of MiB, return a reasonable display format for that value. 
function formatMB(mb) {
  if (mb == 0)
	  return "";
  
  var gb = mb / 1024;
  var tb = gb / 1024;
  var pb = tb / 1024;
  if (pb >= 1) return formatThreeDecimals(pb) + " PB";
  if (tb >= 1) return formatThreeDecimals(tb) + " TB";
  if (gb >= 1) return formatThreeDecimals(gb) + " GB";
  return formatThreeDecimals(mb) + " MB";
}

// If the user has selected per-dollar display, return s with suffix appended. Otherwise return s unchanged.
function maybeRelative(s, suffix, $scope) {
  if ($scope.display == "relative" && s.length > 0)
   return s + suffix;
  else
   return s;
}

// Overwrite most UI state with the values in the given object. Any values not specified are set
// to their default / initial values.
// 
// We don't overwrite the providers, regions, costOfFunds, or ec2ResalePercent fields, unless specified
// in preset.
function applyPreset(preset) {
  var values = {
      terms: defaultTerms(),
      minUpfront: "",
      maxUpfront: "",
      minHourly: "",
      maxHourly: "",
      minCores: "",
      maxCores: "",
      minRam: "",
      maxRam: "",
      minDisk: "",
      maxDisk: "",
      minFlash: "",
      maxFlash: "",
      hoursPerDay: 24,
      lifetimeInMonths: 1,
      display: "absolute",
      sort: [{field: "amortizedCost", ascending: true}, {field: "hourlyCost", ascending: true}]
  };
  
  for (var key in preset)
    values[key] = preset[key];
  
  for (var key in values)
    serverCostsScope[key] = values[key];
  
  serverCostsScope.$digest();
  
  $('#presets').modal('hide');
}

// Return a sort clause which sorts in descending order on the given field; breaking ties by amortized cost
// and then upfront cost.
function sortDescending(fieldname) {
  return [{field: fieldname, ascending: false}, {field: "amortizedCost", ascending: true}, {field: "upfrontCost", ascending: true}];
}

// Register our Bootstrap JavaScript components and click handlers 200ms after the DOM finishes loading. We can't
// register until AngularJS has finished expanding our template, and I haven't found a simpler and more reliable place
// to invoke this.
$(document).ready(function() {
  window.setTimeout(function(){
    $('.tooltipSpan').tooltip();
    $('.dropdown-toggle').dropdown();
  }, 200);
  
  $('#quickrefButton').click(function() {
    $('#quickReference').modal({});
  });
  
  $('#closeQuickRef').click(function() {
    $('#quickReference').modal('hide');
  });
  
  $('#presetsButton').click(function() {
    $('#presets').modal({backdrop: false});
  });
  
  $('#closePresets').click(function() {
    $('#presets').modal('hide');
  });
});