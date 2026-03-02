let products = [];
let cart = [];

// Load products from database
function loadProducts() {
    fetch('api/get_products.php')
        .then(response => response.json())
        .then(data => {
            products = data;
            displayProducts(products);
        })
        .catch(error => console.error('Error loading products:', error));
}

// Display products in the grid
function displayProducts(productList) {
    const productContainer = document.getElementById('productList');
    productContainer.innerHTML = '';

    productList.forEach(product => {
        const productCard = `
            <div class="col-md-4 col-sm-6 mb-3">
                <div class="card product-card" onclick="addToCart(${product.id})">
                    <div class="card-body text-center">
                        <h6 class="card-title">${product.name}</h6>
                        <p class="text-muted mb-1">Code: ${product.code}</p>
                        <p class="text-success font-weight-bold">$${parseFloat(product.price).toFixed(2)}</p>
                        <small class="text-muted">Stock: ${product.quantity}</small>
                    </div>
                </div>
            </div>
        `;
        productContainer.innerHTML += productCard;
    });
}

// Search products
document.getElementById('searchProduct')?.addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm) || 
        p.code.toLowerCase().includes(searchTerm)
    );
    displayProducts(filtered);
});

// Add product to cart
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || product.quantity <= 0) {
        alert('Product not available');
        return;
    }

    const cartItem = cart.find(item => item.id === productId);
    if (cartItem) {
        cartItem.quantity++;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: parseFloat(product.price),
            quantity: 1
        });
    }
    updateCart();
}

// Update cart display
function updateCart() {
    const cartContainer = document.getElementById('cartItems');
    cartContainer.innerHTML = '';
    let total = 0;

    cart.forEach((item, index) => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        
        cartContainer.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>$${item.price.toFixed(2)}</td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                           value="${item.quantity}" min="1" 
                           onchange="updateQuantity(${index}, this.value)">
                </td>
                <td>$${subtotal.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="removeFromCart(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    document.getElementById('totalAmount').textContent = total.toFixed(2);
}

// Update item quantity
function updateQuantity(index, quantity) {
    cart[index].quantity = parseInt(quantity);
    updateCart();
}

// Remove from cart
function removeFromCart(index) {
    cart.splice(index, 1);
    updateCart();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadProducts();
});
