'use strict';

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const pageData = require('../app/lib/pageData');

const SITE = path.join(__dirname, '..', 'IAMSREE');
const VIEWS = path.join(__dirname, '..', 'app', 'views', 'public');

const PAGES = [
  { name: 'index.html', template: 'index.ejs', locals: pageData.homepage() },
  { name: 'services.html', template: 'services.ejs', locals: pageData.servicesPage() },
  { name: 'portfolio.html', template: 'portfolio.ejs', locals: pageData.portfolioPage() },
  { name: 'portfolio-details.html', template: 'portfolio-details.ejs', locals: pageData.projectPage('krooqi') }
];

for (const page of PAGES) {
  const templatePath = path.join(VIEWS, page.template);
  const rendered = ejs.render(fs.readFileSync(templatePath, 'utf8'), page.locals, {
    filename: templatePath
  });
  
  const crlfRendered = rendered.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  fs.writeFileSync(path.join(SITE, page.name), crlfRendered);
  console.log(`Synced ${page.name}`);
}
