-- Use your database
-- USE quality;

-- Clear existing data (optional, but good for a clean seed)
DELETE FROM shipment_checklist_responses;
DELETE FROM shipped_units;
DELETE FROM shipments;
DELETE FROM model_numbers;

-- Seed some models
INSERT INTO model_numbers (model_type, part_number, description, is_active) VALUES
('Scanner', 'SCN-2024-A', 'Standard 2D Barcode Scanner', TRUE),
('Camera', 'CAM-HD-PRO-V2', 'Professional High-Definition Camera with Zoom', TRUE),
('Microphone', 'X-MIC-PRO', 'Studio Quality Condenser Microphone', TRUE),
('Power Supply', 'PSU-12V-5A', '12 Volt, 5 Amp Power Supply Unit', FALSE);

-- Seed a shipment
INSERT INTO shipments (customer_name, job_number, shipping_date, qc_name, status) VALUES
('Global Tech Inc.', 'GT-9501-A', '2025-07-20', 'John Doe', 'Completed');

-- Get the ID of the shipment we just created
SET @last_shipment_id = LAST_INSERT_ID();

-- Seed some units for that shipment
INSERT INTO shipped_units (shipment_id, model_type, part_number, serial_number, first_test_pass, retest_reason) VALUES
(@last_shipment_id, 'Scanner', 'SCN-2024-A', 'SN-SCN-001', TRUE, NULL),
(@last_shipment_id, 'Scanner', 'SCN-2024-A', 'SN-SCN-002', TRUE, NULL),
(@last_shipment_id, 'Camera', 'CAM-HD-PRO-V2', 'SN-CAM-101', FALSE, 'tuning'),
(@last_shipment_id, 'Camera', 'CAM-HD-PRO-V2', 'SN-CAM-102', TRUE, NULL);

-- Seed another shipment
INSERT INTO shipments (customer_name, job_number, shipping_date, qc_name, status) VALUES
('Innovate Solutions', 'IS-2025-03', CURDATE(), 'Jane Smith', 'In Progress');

SET @last_shipment_id = LAST_INSERT_ID();

INSERT INTO shipped_units (shipment_id, model_type, part_number, serial_number, first_test_pass, retest_reason) VALUES
(@last_shipment_id, 'Microphone', 'X-MIC-PRO', 'SN-MIC-550', TRUE, NULL);