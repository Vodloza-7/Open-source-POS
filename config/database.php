<?php
// Database configuration
define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', 'password');
define('DB_NAME', 'pos_system');

// Create connection
$conn = new mysqli(DB_HOST, DB_USER, DB_PASS);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Create database if it doesn't exist
$sql = "CREATE DATABASE IF NOT EXISTS " . DB_NAME;
$conn->query($sql);

// Select database
$conn->select_db(DB_NAME);

// Create tables
$tables = [
    "CREATE TABLE IF NOT EXISTS products (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100) UNIQUE,
        barcode VARCHAR(100),
        price DECIMAL(10, 2) NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        image VARCHAR(255),
        category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )",
    
    "CREATE TABLE IF NOT EXISTS sales (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        total DECIMAL(10, 2),
        tax DECIMAL(10, 2),
        payment_method VARCHAR(50),
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )",
    
    "CREATE TABLE IF NOT EXISTS sale_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        sale_id INT,
        product_id INT,
        quantity INT,
        price DECIMAL(10, 2),
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    )",
    
    "CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        role VARCHAR(50) DEFAULT 'cashier',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )"
];

foreach ($tables as $table) {
    $conn->query($table);
}

// Insert sample products if table is empty
$result = $conn->query("SELECT COUNT(*) as count FROM products");
$row = $result->fetch_assoc();

if ($row['count'] == 0) {
    $sampleProducts = [
        ['Laptop', 'SKU001', '1001', 999.99, 10, 'Electronics'],
        ['Mouse', 'SKU002', '1002', 29.99, 50, 'Electronics'],
        ['Keyboard', 'SKU003', '1003', 79.99, 30, 'Electronics'],
        ['Monitor', 'SKU004', '1004', 299.99, 15, 'Electronics'],
        ['USB Cable', 'SKU005', '1005', 9.99, 100, 'Accessories'],
        ['Headphones', 'SKU006', '1006', 149.99, 20, 'Audio'],
        ['Webcam', 'SKU007', '1007', 89.99, 25, 'Electronics'],
        ['Desk Lamp', 'SKU008', '1008', 49.99, 40, 'Furniture']
    ];
    
    foreach ($sampleProducts as $product) {
        $stmt = $conn->prepare("INSERT INTO products (name, sku, barcode, price, quantity, category) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("sssdis", $product[0], $product[1], $product[2], $product[3], $product[4], $product[5]);
        $stmt->execute();
    }
}

// Insert sample user if table is empty
$result = $conn->query("SELECT COUNT(*) as count FROM users");
$row = $result->fetch_assoc();

if ($row['count'] == 0) {
    $password = password_hash('password123', PASSWORD_DEFAULT);
    $stmt = $conn->prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)");
    $name = 'Admin User';
    $email = 'admin@pos.com';
    $role = 'admin';
    $stmt->bind_param("ssss", $name, $email, $password, $role);
    $stmt->execute();
}

?>
