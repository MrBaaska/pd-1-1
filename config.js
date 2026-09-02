// Centralized shared links config.
// These external library URLs are copy-pasted across several HTML pages.
// Change a URL here once and every page that calls loadScript()/loadStylesheet()
// with the matching key picks up the new value automatically.
window.CDN_LINKS = {
  TAILWIND: 'https://cdn.tailwindcss.com',
  HTML5_QRCODE: 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  FONT_AWESOME_CSS: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  JSPDF: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  JSPDF_AUTOTABLE: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js'
};

// Injects a blocking <script src="..."> exactly where this call appears,
// so libraries load in the same order/timing as the original hardcoded tags.
window.loadScript = function (url) {
  document.write('<script src="' + url + '"><' + '/script>');
};

// Injects a <link rel="stylesheet" href="..."> exactly where this call appears.
window.loadStylesheet = function (url) {
  document.write('<link rel="stylesheet" href="' + url + '">');
};
