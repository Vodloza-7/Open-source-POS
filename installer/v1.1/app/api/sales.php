<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

require_once(__DIR__ . '/../config/database.php');

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($input['items']) || empty($input['items'])) {
            throw new Exception("No items in sale");
        }
        
        // Start transaction
        $conn->begin_transaction();
        
        $user_id = 1; // Default user
        $total = $input['total'] ?? 0;
        $tax = $input['tax'] ?? 0;
        $payment_method = $input['paymentMethod'] ?? 'cash';
        
        // Insert sale
        $stmt = $conn->prepare("INSERT INTO sales (user_id, total, tax, payment_method) VALUES (?, ?, ?, ?)");
        $stmt->bind_param("idds", $user_id, $total, $tax, $payment_method);
        $stmt->execute();
        $sale_id = $stmt->insert_id;
        
        // Insert sale items
        $itemStmt = $conn->prepare("INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)");
        
        foreach ($input['items'] as $item) {
            $product_id = $item['id'];
            $quantity = $item['quantity'];
            $price = $item['price'];
            
            $itemStmt->bind_param("iidi", $sale_id, $product_id, $quantity, $price);
            $itemStmt->execute();
            
            // Update product quantity
            $updateStmt = $conn->prepare("UPDATE products SET quantity = quantity - ? WHERE id = ?");
            $updateStmt->bind_param("ii", $quantity, $product_id);
            $updateStmt->execute();
        }
        
        $conn->commit();
        
        echo json_encode([
            'success' => true,
            'message' => 'Sale completed successfully',
            'sale_id' => $sale_id
        ]);
        
    } else {
        throw new Exception("Invalid request method");
    }
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
