<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

require_once(__DIR__ . '/../../config/db.php');

try {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || !isset($input['items']) || empty($input['items'])) {
        throw new Exception("Invalid sale data");
    }

    mysqli_begin_transaction($conn);

    $userId = $_SESSION['user_id'] ?? 1;
    $subtotal = $input['subtotal'] ?? 0;
    $tax = $input['tax'] ?? 0;
    $total = $input['total'] ?? 0;
    $paymentMethod = $input['paymentMethod'] ?? 'cash';
    $saleDate = date('Y-m-d H:i:s');

    // Insert sale record
    $saleQuery = "INSERT INTO sales (user_id, total, tax, payment_method, sale_date) VALUES (?, ?, ?, ?, ?)";
    $saleStmt = $conn->prepare($saleQuery);
    $saleStmt->bind_param("iddss", $userId, $total, $tax, $paymentMethod, $saleDate);
    
    if (!$saleStmt->execute()) {
        throw new Exception("Failed to create sale record");
    }

    $saleId = $conn->insert_id;

    // Insert sale items
    $itemQuery = "INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)";
    $itemStmt = $conn->prepare($itemQuery);

    foreach ($input['items'] as $item) {
        $productId = $item['id'];
        $quantity = $item['quantity'];
        $price = $item['price'];

        $itemStmt->bind_param("iidi", $saleId, $productId, $quantity, $price);
        if (!$itemStmt->execute()) {
            throw new Exception("Failed to add sale item");
        }

        // Update product quantity
        $updateQuery = "UPDATE products SET quantity = quantity - ? WHERE id = ?";
        $updateStmt = $conn->prepare($updateQuery);
        $updateStmt->bind_param("ii", $quantity, $productId);
        if (!$updateStmt->execute()) {
            throw new Exception("Failed to update product quantity");
        }
    }

    mysqli_commit($conn);

    echo json_encode([
        'success' => true,
        'message' => 'Sale completed successfully',
        'saleId' => $saleId
    ]);

} catch (Exception $e) {
    mysqli_rollback($conn);
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}
?>
