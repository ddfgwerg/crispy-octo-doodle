const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { createCanvas } = require('canvas');
const Chart = require('chart.js');

const app = express();
const upload = multer({ dest: 'uploads/' });
const db = new sqlite3.Database(':memory:');

app.set('view engine', 'ejs');
app.use(express.static('public'));

db.serialize(() => {
  db.run("CREATE TABLE data (task TEXT, core TEXT, value INTEGER)");
});

function processFile(filePath, callback) {
  const results = [];
  fs.createReadStream(filePath)
    .pipe(csv({ separator: '\t' }))
    .on('data', (data) => results.push(data))
    .on('end', () => {
      callback(results);
    });
}

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/upload', upload.single('file'), (req, res) => {
  const filePath = req.file.path;
  processFile(filePath, (data) => {
    db.serialize(() => {
      const stmt = db.prepare("INSERT INTO data VALUES (?, ?, ?)");
      data.forEach(row => {
        Object.keys(row).forEach(task => {
          if (task !== 'core') {
            stmt.run(task, row['core'], parseInt(row[task]));
          }
        });
      });
      stmt.finalize();

      db.all("SELECT task, core, MIN(value) as min, MAX(value) as max, AVG(value) as avg, STDDEV(value) as std FROM data GROUP BY task, core", (err, rows) => {
        if (err) {
          console.error(err);
          res.status(500).send("Database query error");
          return;
        }

        const canvas = createCanvas(800, 600);
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: rows.map(row => `${row.task}-${row.core}`),
            datasets: [{
              label: 'Standard Deviation',
              data: rows.map(row => row.std),
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1
            }]
          },
          options: {
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });

        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync('public/std_chart.png', buffer);

        res.render('results', { stats: rows, stdChart: 'std_chart.png' });
      });
    });
  });
});

app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
