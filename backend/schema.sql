-- This script creates all tables if they don't already exist.
-- It is designed to be run on an empty database to set it up correctly.

CREATE TABLE IF NOT EXISTS `model_numbers` (
    `model_id` INT AUTO_INCREMENT PRIMARY KEY,
    `model_type` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `part_number` VARCHAR(128) NOT NULL UNIQUE,
    `is_active` BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS `checklist_master_items` (
    `item_id` INT AUTO_INCREMENT PRIMARY KEY,
    `item_text` TEXT NOT NULL,
    `item_order` INT NOT NULL,
    `is_active` BOOLEAN DEFAULT TRUE
);

-- Seed the master checklist with default items. INSERT IGNORE prevents errors if run twice.
INSERT IGNORE INTO `checklist_master_items` (`item_id`, `item_text`, `item_order`, `is_active`) VALUES
(1, 'For new product, FAI report completed and passed', 10, TRUE),
(2, 'Process traveler complete', 20, TRUE),
(3, 'Datasheet complete and approved by Orbital engineer', 30, TRUE),
(4, 'Visual check for any defects, scratches, marks', 40, TRUE),
(5, 'Etching is complete, including correct model number and s/n', 50, TRUE),
(6, 'Barcode label is printed with a correct s/n and placed correctly', 60, TRUE),
(7, 'All documentation (QSG, manuals, guides) is complete and accurate', 70, TRUE),
(8, 'All necessary accessories (power supply, cables, etc...) are accounted for', 80, TRUE),
(9, 'Proper packaging is used to ensure no damage', 90, TRUE),
(10, 'Shipping carrier selected based on customer needs and lowest cost', 100, TRUE),
(11, 'Packing List complete with correct s/n & verified by QC', 110, TRUE);

CREATE TABLE IF NOT EXISTS `shipments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `customer_name` VARCHAR(255) NOT NULL,
    `job_number` VARCHAR(128) NOT NULL,
    `shipping_date` DATE NOT NULL,
    `qc_name` VARCHAR(255) NOT NULL,
    `status` ENUM('In Progress', 'Completed') DEFAULT 'In Progress',
    CONSTRAINT `uc_job_shipping_date` UNIQUE (`job_number`, `shipping_date`)
);

CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(80) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `shipped_units` (
    `unit_id` INT AUTO_INCREMENT PRIMARY KEY,
    `shipment_id` INT NOT NULL,
    `model_type` VARCHAR(255) NOT NULL,
    `part_number` VARCHAR(128) NOT NULL,
    `serial_number` VARCHAR(128) NOT NULL UNIQUE,
    `first_test_pass` BOOLEAN DEFAULT TRUE,
    `failed_equipment` ENUM('ATE1', 'ATE2', 'ATE3', 'ATE4', 'ATE5', 'Other'),
    `retest_reason` TEXT,
    FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`part_number`) REFERENCES `model_numbers`(`part_number`) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS `shipment_checklist_responses` (
    `response_id` INT AUTO_INCREMENT PRIMARY KEY,
    `shipment_id` INT NOT NULL,
    `item_id` INT NOT NULL,
    `status` ENUM('Passed', 'NA') NOT NULL,
    `completed_by` VARCHAR(255),
    `completion_date` DATE,
    FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`item_id`) REFERENCES `checklist_master_items`(`item_id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_response` (`shipment_id`,`item_id`)
);