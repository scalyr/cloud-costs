Server Cost Comparison
---

This is the source code for Scalyr's [Cloud Cost Calculator](https://www.scalyr.com/cloud/) tool.
You can read all about it in [this blog post](http://blog.scalyr.com/2013/11/11/cloud-cost-calculator/).

Contributions are welcome! We're open to any sort of suggestions. Any graphic designers out there who feel like cleaning
up the page design are welcome to give it a whack.

**We're especially interested in getting data for additional service providers, including some non-cloud
hosting services.** To contribute, just create a JavaScript file listing each offering from that provider.
Your file should contain a series of function calls like this:

		serverChoices.push({
		  "provider": "Google",
		  "region": "Europe",
		  "location": "Europe West",
		  "serverType": "n1-highcpu-4-d",
		  "reservationType": "hourly",
		  "term": "Hour",
		  "termMonths": 0.0,
		  "upfrontCost": 0.0,
		  "hourlyCost": 0.369,
		  "cores": 4.0,
		  "ramMB": 3686.4,
		  "diskMB": 1812480.0,
		  "flashMB": 0.0,
		  "networkMbps": 0.0
		});

Look at files like linode.js for an example. Each call defines a single combination of server type,
data center location, lease type, or any other parameters as appropriate to this service provider.
The fields are interpreted as follows:

<table>
  <tr><th>Field</th><th>Meaning</th></tr>
  <tr><td>provider</td><td>Name of the company offering this server.</td></tr>
  <tr><td>region</td><td>What part of the world the server is in. Use "N. America", "S. America",
      "Europe", "Asia", "Africa", or "Australia".</td></tr>
  <tr><td>location</td><td>The service provider's name for this location.</td></tr>
  <tr><td>serverType</td><td>The service provider's name for this server configuration.</td></tr>
  <tr><td>reservationType</td><td>The service provider's name for this lease term or reservation type.</td></tr>
  <tr><td>term</td><td>Which category the lease / reservation falls into: Hour, Month, Year, or "3 Years".</td></tr>
  <tr><td>termMonths</td><td>How many months the lease / reservation lasts for; 0 for on-demand / by-the-hour services.</td></tr>
  <tr><td>upfrontCost</td><td>Any fixed, up-front cost for this offering, in dollars.</td></tr>
  <tr><td>hourlyCost</td><td>Any per-hour cost for this offering, in dollars.</td></tr>
  <tr><td>cores</td><td>Number of CPU cores (or equivalent).</td></tr>
  <tr><td>ramMB</td><td>Memory size, in MiB.</td></tr>
  <tr><td>diskMB</td><td>Disk size, in MiB. (SSD should not be included in this value; report 0 for SSD-only servers.)</td></tr>
  <tr><td>flashMB</td><td>SSD storage size, in MiB.</td></tr>
  <tr><td>networkMbps</td><td>Bundled/free network bandwidth, in Mbps (megabits per second). Note, this value
      is not currently used, but may be used in a future version of the tool.</td></tr>
</table>

You can send us a pull request, or just e-mail us the JavaScript file and we'll add it in.

For questions, suggestions, feedback, or anything else: contact@scalyr.com.