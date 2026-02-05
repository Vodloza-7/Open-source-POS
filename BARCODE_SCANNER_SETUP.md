# Barcode Scanner USB Setup & Configuration Guide

## Overview
The POS system now supports USB barcode scanners. When a barcode is scanned, the system automatically retrieves the product from the database and adds it to the cart.

---

## How Barcode Scanning Works

### 1️⃣ **Automatic Scanning (USB Connected)**
- Connect your USB barcode scanner to your computer
- Click on the barcode input field in the POS system
- Scan the barcode using your USB scanner
- The product will be automatically identified and added to cart

### 2️⃣ **Manual Barcode Entry**
- Click on the "Scan or enter barcode, then press Enter" input field
- Type the barcode number manually
- Press **ENTER**
- Product will be identified and added to cart

### 3️⃣ **Product Lookup Priority**
The system searches for products in this order:
1. **Barcode** (First priority)
2. **HS Code** (Second priority)
3. **Product ID** (Third priority)
4. **Product Name** (Last resort)

This ensures accurate product identification from any input method.

---

## USB Barcode Scanner Setup

### Hardware Requirements
- USB Barcode Scanner (with HID - Human Interface Device support)
- USB Port on your computer
- Most modern scanners support: Code 128, EAN-13, UPC-A standards

### Supported Scanners
✅ Zebra (LS1203, LS2208, DS3678, etc.)
✅ Honeywell (Voyager, Hyperion, etc.)
✅ Motorola/Symbol (LS2208, DS6878, etc.)
✅ Datalogic (QuickScan, Touch, etc.)
✅ Newland (NLS-NQuire, etc.)
✅ Any standard USB HID barcode scanner

---

## Installation Steps

### Windows Setup

#### **Step 1: Physical Connection**
1. Locate an available USB port on your computer
2. Connect the barcode scanner USB cable
3. Windows will automatically recognize the device

#### **Step 2: Verify Driver Installation**
1. Open Device Manager (right-click Start > Device Manager)
2. Look for "Human Interface Devices"
3. Expand the section and find your barcode scanner
4. It should show without any warning icons (✓)

#### **Step 3: Test Scanner**
1. Open Notepad or any text editor
2. Click in the text field
3. Press the scan button on the scanner
4. If a code appears, the scanner is working correctly

#### **Step 4: Configure POS System**
1. Open the POS system in your browser
2. Locate the "Scan or enter barcode" input field at the top of the products section
3. Click once on the input field
4. The field is now ready for barcode input

---

### Linux Setup

#### **Step 1: Install HID Support**
```bash
sudo apt-get update
sudo apt-get install libusb-1.0-0 libhidapi-hidraw0
```

#### **Step 2: Check Permissions**
```bash
# Add your user to the uucp and dialout groups
sudo usermod -a -G uucp $USER
sudo usermod -a -G dialout $USER

# Log out and log back in for changes to take effect
```

#### **Step 3: Verify Scanner Connection**
```bash
# List all USB devices
lsusb

# Check if your scanner appears
# Example output: Bus 001 Device 003: ID 05e0:0100 Symbol Technologies Barcode scanner
```

#### **Step 4: Test with evtest (Optional)**
```bash
# Install evtest if needed
sudo apt-get install evtest

# Run evtest to see keyboard input
sudo evtest
# Select your barcode scanner device
# Scan a barcode - you should see characters appear
```

---

### macOS Setup

#### **Step 1: Connect Scanner**
1. Connect the USB barcode scanner to your Mac
2. No driver installation needed - macOS recognizes HID devices automatically

#### **Step 2: Verify Connection**
1. Apple menu > System Preferences > USB
2. You should see your barcode scanner listed

#### **Step 3: Test Scanner**
1. Open any text editor
2. Click in the text field
3. Scan a barcode
4. The barcode should appear as text

---

## Using the Barcode Scanner in POS

### ✅ **Normal Workflow**

```
1. Customer hands you an item
   ↓
2. Click on the barcode input field
   ↓
3. Scan or type the barcode
   ↓
4. Product automatically appears in cart
   ↓
5. Repeat for each item
   ↓
6. Click "Checkout" when done
```

### ⚠️ **Product Not Found**

If a barcode is scanned but the product isn't found:
- A popup notification will appear
- Shows the scanned barcode
- Offers options to:
  - Try scanning again
  - Search for product manually
  - Close and continue

### 📝 **Manual Search Alternative**

If the scanner isn't working or the barcode isn't in the system:
1. Use the **"Search products..."** field
2. Type product name or code
3. Click on the product card from results
4. Product is added to cart

---

## Barcode Format Support

### Standard Formats Supported:
- **EAN-13** (European Article Number) - Most common
- **UPC-A** (Universal Product Code) - North America
- **Code 128** - Various industries
- **Code 39** - Alphanumeric
- **ISBN** - Books
- **Custom formats** - As long as your scanner supports it

### Example Barcodes:
```
EAN-13:  5901234123457
UPC-A:   036000291452
Code 128: *123ABC*
ISBN:     978-0-596-00712-6
```

---

## Troubleshooting

### ❌ Problem: Scanner Not Found After Connecting

**Solution:**
1. Unplug the scanner
2. Wait 10 seconds
3. Plug back in
4. Refresh the POS page in browser (F5)

### ❌ Problem: Scanned Barcode Not Recognized

**Solution:**
1. Verify the product exists in your database
2. Check the barcode is entered correctly in product settings
3. Use the "Try Again" button in the error popup
4. Manually search for the product and add to cart

### ❌ Problem: Scanner Types Gibberish Characters

**Solution:**
1. Scanner may be in wrong mode (check scanner manual)
2. Verify scanner is set to transmit as "Keyboard" (HID mode)
3. Check for any mode settings in the scanner's physical buttons
4. Try a known good barcode to test

### ❌ Problem: Barcode Input Field Not Responding

**Solution:**
1. Refresh the POS page (F5)
2. Click directly on the barcode input field
3. Check browser console for errors (F12)
4. Try in a different browser

### ❌ Problem: Scanner Works in Notepad but Not in POS

**Solution:**
1. Ensure the barcode input field is focused (cursor visible)
2. Check if there's a JavaScript error (F12 > Console)
3. Try manually typing a barcode number
4. Clear browser cache and refresh

---

## Advanced Configuration

### Keyboard Mapping (If Scanner Types Special Characters)

Most USB barcode scanners act as keyboard input devices. If you experience issues:

1. **Check Scanner DIP Switches**
   - Refer to your scanner's manual
   - Ensure it's set to "Keyboard" or "HID" mode
   - Disable any special character injection modes

2. **Configure Scanner Software (if provided)**
   - Some scanners come with configuration software
   - Ensure prefix/suffix characters are disabled
   - Set encoding to standard UTF-8

### Product Barcode Format Standards

For best results, ensure your product database barcodes match your scanner output:

```
Product Setup:
- Barcode: Exact match of physical barcode (e.g., 5901234123457)
- HS Code: Alternative code (e.g., old SKU number)
- ID: Numeric product ID
```

---

## Security Tips

🔒 **Best Practices:**
1. Scan barcodes only from trusted sources
2. Verify product information before checkout
3. Keep scanner driver software updated
4. Use HTTPS for POS web interface
5. Don't leave scanner unattended during transactions

---

## Performance Tips

⚡ **Optimize Scanner Speed:**
1. Ensure database is properly indexed (speeds product lookup)
2. Close unnecessary browser tabs
3. Use a modern browser (Chrome, Firefox, Safari, Edge)
4. Ensure stable internet connection (if web-based POS)
5. Regular database maintenance to keep lookups fast

---

## Product Database Integration

### Adding Barcodes to Products

1. Go to **Manage Products** section
2. Click **Edit** on a product
3. Enter the barcode number in the **Barcode** field
4. Also enter **HS Code** if available
5. Save changes

### Bulk Import Barcodes

To import multiple barcodes:
1. Prepare CSV with columns: `product_id, barcode, hscode`
2. Contact your administrator for import process
3. Or manually add in products management

---

## Testing Your Setup

### ✅ Test Checklist:

- [ ] Scanner physically connected and powered
- [ ] Appears in Device Manager / System Preferences
- [ ] Barcode input field is visible in POS
- [ ] Can click on barcode input field
- [ ] Scanning produces text in the field
- [ ] Pressing ENTER adds product to cart
- [ ] Error messages display for unknown barcodes
- [ ] Manual entry works with ENTER key
- [ ] Products list updates in real-time

---

## Support & Resources

📧 **For Technical Support:**
- Check this guide for troubleshooting
- Review browser console (F12) for error messages
- Test scanner with simple text editor first
- Contact your POS system administrator

🔗 **Scanner Documentation:**
- Zebra Scanners: https://www.zebra.com/us/en.html
- Honeywell: https://www.sensormatic.honeywell.com/
- Motorola: https://www.motorolasolutions.com/
- Datalogic: https://www.datalogic.com/

---

## Quick Reference

| Action | Result |
|--------|--------|
| Scan barcode | Product added to cart |
| Type barcode + ENTER | Product added to cart |
| Unknown barcode | Error notification appears |
| Click "Try Again" | Focus returns to barcode field |
| Search field | Manual product search |
| Checkout | Complete the sale with receipt |

---

**Last Updated:** February 2026
**Version:** 1.0
**Compatibility:** All modern USB barcode scanners with HID support
