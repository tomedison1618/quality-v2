import React, { useState, useEffect } from 'react';
import { getModels, checkSerialUnique, checkOriginalSerialUnique } from '../../services/apiService';
import MultiReasonSelect from './MultiReasonSelect';

const EditUnitModal = ({ unit, isOpen, onClose, onSave }) => {
    // State for the form fields
    const [modelTypes, setModelTypes] = useState([]);
    const [allModels, setAllModels] = useState([]);
    const [selectedType, setSelectedType] = useState('');
    const [selectedPartNumber, setSelectedPartNumber] = useState('');
    const [serialNumber, setSerialNumber] = useState('');
    const [originalSerialNumber, setOriginalSerialNumber] = useState('');
    const [isSerialUnique, setIsSerialUnique] = useState(true);
    const [isOriginalSerialUnique, setIsOriginalSerialUnique] = useState(true);
    const [firstTestPass, setFirstTestPass] = useState(true);
    const [failedEquipment, setFailedEquipment] = useState('');
    const [retestReason, setRetestReason] = useState('');
    

    // Pre-fill the form when the modal opens with a new unit
    useEffect(() => {
        if (unit) {
            setSelectedType(unit.model_type);
            setSelectedPartNumber(unit.part_number);
            setSerialNumber(unit.serial_number);
            setOriginalSerialNumber(unit.original_serial_number || '');
            setFirstTestPass(unit.first_test_pass);
            setFailedEquipment(unit.failed_equipment || '');
            setRetestReason(unit.retest_reason || '');
        }
        // Fetch models for dropdowns
        const fetchAllModels = async () => {
            const response = await getModels();
            setModelTypes(response.data.model_types);
            setAllModels(response.data.all_models);
        };
        fetchAllModels();
    }, [unit]);

    // Proactive check for serial number uniqueness (if it has changed)
    useEffect(() => {
        if (!unit || serialNumber.trim() === '' || serialNumber === unit.serial_number) {
            setIsSerialUnique(true);
            return;
        }
        const handler = setTimeout(async () => {
            const response = await checkSerialUnique(serialNumber);
            setIsSerialUnique(response.data.is_unique);
        }, 500);

        return () => clearTimeout(handler);
    }, [serialNumber, unit]);

    // Proactive check for original serial number uniqueness (if it has changed)
    useEffect(() => {
        if (!unit || originalSerialNumber.trim() === '' || originalSerialNumber === unit.original_serial_number) {
            setIsOriginalSerialUnique(true);
            return;
        }
        const handler = setTimeout(async () => {
            const response = await checkOriginalSerialUnique(originalSerialNumber);
            setIsOriginalSerialUnique(response.data.is_unique);
        }, 500);

        return () => clearTimeout(handler);
    }, [originalSerialNumber, unit]);

    const handleSave = () => {
        if (!isSerialUnique) {
            alert('This serial number already exists.');
            return;
        }
        if (!isOriginalSerialUnique) {
            alert('This original serial number already exists.');
            return;
        }
        const updatedUnit = {
            ...unit,
            model_type: selectedType,
            part_number: selectedPartNumber,
            serial_number: serialNumber,
            original_serial_number: originalSerialNumber,
            first_test_pass: firstTestPass,
            failed_equipment: firstTestPass ? null : (failedEquipment || null),
            retest_reason: firstTestPass ? null : (retestReason || null)
        };
        onSave(updatedUnit);
    };

    if (!isOpen) return null;

    const partNumbersForSelectedType = allModels.filter(
        m => m.model_type === selectedType && m.is_active
    );

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Edit Unit</h2>
                <div className="edit-unit-form">
                    <div className="form-row">
                        <select value={selectedType} onChange={e => { setSelectedType(e.target.value); setSelectedPartNumber(''); }} required>
                            <option value="">-- Select Model Type --</option>
                            {modelTypes.map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                        <select value={selectedPartNumber} onChange={e => setSelectedPartNumber(e.target.value)} required disabled={!selectedType}>
                            <option value="">-- Select Part Number --</option>
                            {partNumbersForSelectedType.map(model => <option key={model.part_number} value={model.part_number}>{model.part_number}</option>)}
                        </select>
                    </div>
                    <div className="form-row">
                        <div className="serial-input-wrapper">
                            <input type="text" placeholder="Original Serial Number" value={originalSerialNumber} onChange={e => setOriginalSerialNumber(e.target.value)} className="original-serial-input" />
                            {!isOriginalSerialUnique && <span className="serial-error">! Exists</span>}
                        </div>
                        <div className="serial-input-wrapper">
                            <input type="text" placeholder="Serial Number" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} required />
                            {!isSerialUnique && <span className="serial-error">! Exists</span>}
                        </div>
                        <label className="checkbox-label">
                            <input type="checkbox" checked={firstTestPass} onChange={e => setFirstTestPass(e.target.checked)} />
                            First Test Pass
                        </label>
                    </div>
                    {!firstTestPass && (
                        <div className="form-row">
                            <select value={failedEquipment} onChange={e => setFailedEquipment(e.target.value)} required className="failed-equipment-select">
                                <option value="">-- Select Failed Equipment --</option>
                                <option value="ATE1">ATE1</option>
                                <option value="ATE2">ATE2</option>
                                <option value="ATE3">ATE3</option>
                                <option value="ATE4">ATE4</option>
                                <option value="ATE5">ATE5</option>
                                <option value="Other">Other</option>
                            </select>
                            <MultiReasonSelect 
                                value={retestReason} 
                                onChange={setRetestReason}
                            />
                        </div>
                    )}
                </div>
                <div className="modal-actions">
                    <button onClick={onClose} className="cancel-btn">Cancel</button>
                    <button onClick={handleSave} className="save-btn" disabled={!isSerialUnique || !isOriginalSerialUnique}>Save Changes</button>
                </div>
            </div>
        </div>
    );
};

export default EditUnitModal;