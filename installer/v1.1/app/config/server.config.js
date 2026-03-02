const config = {
  "app": {
    "port": 3000
  },
  "db": {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "",
    "name": "pos_system"
  },
  "smtp": {
    "host": "",
    "port": 587,
    "user": "",
    "pass": "",
    "from": "no-reply@pos.local"
  }
};

module.exports = config;
