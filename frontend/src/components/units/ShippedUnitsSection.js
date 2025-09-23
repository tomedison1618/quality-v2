import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getModels, checkSerialUnique, checkOriginalSerialUnique, addUnit, deleteUnit, updateUnit } from '../../services/apiService';
import EditUnitModal from './EditUnitModal';
import MultiReasonSelect from './MultiReasonSelect';
import toast from 'react-hot-toast'; // Assuming you have toast notifications installed

const ShippedUnitsSection = ({ units, shipmentId, onUpdate, disabled, jobNumberPrefix }) => {
    const prefix = useMemo(() => {
        if (!jobNumberPrefix) return '';
        const parts = jobNumberPrefix.split('-');
        return `${parts[0]}-`;
    }, [jobNumberPrefix]);

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
    const serialNumberInputRef = useRef(null);
    const [editingUnit, setEditingUnit] = useState(null);

    const getNextSuffix = (currentUnits) => {
        if (!prefix) return '';
    
        const existingSuffixes = currentUnits
            .map(u => u.serial_number)
            .filter(sn => sn && sn.startsWith(prefix))
            .map(sn => parseInt(sn.substring(prefix.length), 10))
            .filter(num => !isNaN(num));
    
        const maxSuffix = existingSuffixes.length > 0 ? Math.max(...existingSuffixes) : 0;
        return (maxSuffix + 1).toString().padStart(3, '0');
    };

    useEffect(() => {
        setSerialNumber(`${prefix}${getNextSuffix(units)}`);
    }, [prefix, units]);

    useEffect(() => {
        const fetchModelsForDropdown = async () => {
            try {
                const response = await getModels();
                setModelTypes(response.data.model_types);
                setAllModels(response.data.all_models);
            } catch (error) {
                console.error("Failed to fetch models", error);
            }
        };
        fetchModelsForDropdown();
    }, []);

    useEffect(() => {
        if (serialNumber.trim() === '' || serialNumber.trim() === prefix.trim()) {
            setIsSerialUnique(true);
            return;
        }
        const handler = setTimeout(async () => {
            const response = await checkSerialUnique(serialNumber);
            setIsSerialUnique(response.data.is_unique);
        }, 500);
        return () => clearTimeout(handler);
    }, [serialNumber, prefix]);

    useEffect(() => {
        if (originalSerialNumber.trim() === '') {
            setIsOriginalSerialUnique(true);
            return;
        }
        const handler = setTimeout(async () => {
            const response = await checkOriginalSerialUnique(originalSerialNumber);
            setIsOriginalSerialUnique(response.data.is_unique);
        }, 500);
        return () => clearTimeout(handler);
    }, [originalSerialNumber]);

    const handleAddUnit = async (e) => {
        e.preventDefault();
        if (!selectedPartNumber || !serialNumber) {
            toast.error('Please select a part number and enter a serial number.');
            return;
        }
        if (!isSerialUnique) {
            toast.error('This serial number already exists in the system.');
            return;
        }
        if (!isOriginalSerialUnique) {
            toast.error('This original serial number already exists in the system.');
            return;
        }

        const newUnit = {
            unit_id: `temp-${Date.now()}`,
            model_type: selectedType,
            part_number: selectedPartNumber,
            serial_number: serialNumber,
            original_serial_number: originalSerialNumber,
            first_test_pass: firstTestPass,
            failed_equipment: firstTestPass ? null : (failedEquipment || null),
            retest_reason: firstTestPass ? null : (retestReason || null)
        };

        const updatedUnitsForNextSN = [...units, newUnit];

        // Optimistically update UI
        onUpdate({ units: updatedUnitsForNextSN });
        setSerialNumber(`${prefix}${getNextSuffix(updatedUnitsForNextSN)}`); // Set next serial
        setOriginalSerialNumber('');
        setFirstTestPass(true);
        setFailedEquipment('');
        setRetestReason('');
        serialNumberInputRef.current.focus();

        try {
            const response = await addUnit({ ...newUnit, shipment_id: shipmentId });
            toast.success('Unit added successfully!');
            // Replace temp ID with real ID from backend
            const finalUnits = units.map(u => u.unit_id === newUnit.unit_id ? { ...newUnit, unit_id: response.data.id } : u);
            onUpdate({ units: [...finalUnits, { ...newUnit, unit_id: response.data.id }] });
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to add unit.');
            // Revert optimistic update on error
            onUpdate({ units: units });
        }
    };
    
    const handleDeleteUnit = async (unitId) => {
        if (window.confirm('Are you sure you want to delete this unit?')) {
            const originalUnits = [...units];
            const updatedUnits = units.filter(unit => unit.unit_id !== unitId);
            onUpdate({ units: updatedUnits });
            try {
                await deleteUnit(unitId);
                toast.success('Unit deleted.');
            } catch (error) {
                toast.error('Failed to delete unit.');
                onUpdate({ units: originalUnits });
            }
        }
    };
    
    const handleUpdateUnit = async (updatedUnitData) => {
        const originalUnits = [...units];
        const updatedUnits = units.map(u => u.unit_id === updatedUnitData.unit_id ? updatedUnitData : u);
        onUpdate({ units: updatedUnits });
        setEditingUnit(null);
        try {
            await updateUnit(updatedUnitData.unit_id, updatedUnitData);
            toast.success('Unit updated successfully!');
        } catch (error) {
            toast.error('Failed to update unit.');
            onUpdate({ units: originalUnits });
        }
    };

    const partNumbersForSelectedType = allModels.filter(
        model => model.model_type === selectedType && model.is_active
    );

    return (
        <section className="shipped-units-section">
            {console.log("Rendering ShippedUnitsSection, originalSerialNumber:", originalSerialNumber)}
            <h2>Shipped Units</h2>
            {/* --- THIS IS THE KEY CHANGE --- */}
            {/* Only render the "Add Unit" form if the page is NOT disabled */}
            {!disabled && (
                <form onSubmit={handleAddUnit} className="add-unit-form">
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
                            <input ref={serialNumberInputRef} type="text" placeholder="Serial Number" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} required />
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
                    <div className="form-row">
                        <button type="submit" disabled={!isSerialUnique || !isOriginalSerialUnique}>Add Unit</button>
                    </div>
                </form>
            )}

            <table className="units-table">
                <thead>
                    <tr>
                        <th>Model Type</th>
                        <th>Part Number</th>
                        <th>Original S/N</th>
                        <th>Serial Number</th>
                        <th>1st Pass</th>
                        <th>Failed Equipment</th>
                        <th>Retest Reason</th>
                        {/* --- THIS IS THE KEY CHANGE --- */}
                        {/* Only render the "Actions" header if the page is NOT disabled */}
                        {!disabled && <th className="actions-column">Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {units && units.length > 0 ? (
                        units.map(unit => (
                            <tr key={unit.unit_id}>
                                <td>{unit.model_type}</td>
                                <td>{unit.part_number}</td>
                                <td>{unit.original_serial_number || 'N/A'}</td>
                                <td>{unit.serial_number}</td>
                                <td>{unit.first_test_pass ? 'Yes' : 'No'}</td>
                                <td>{unit.failed_equipment || 'N/A'}</td>
                                <td>{unit.retest_reason || 'N/A'}</td>
                                {/* --- THIS IS THE KEY CHANGE --- */}
                                {/* Only render the actions cell if the page is NOT disabled */}
                                {!disabled && (
                                    <td className="actions-cell">
                                        <button onClick={() => setEditingUnit(unit)} className="edit-btn">Edit</button>
                                        <button onClick={() => handleDeleteUnit(unit.unit_id)} className="delete-btn">Delete</button>
                                    </td>
                                )}
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={disabled ? 7 : 8}>No units have been added to this shipment.</td>
                        </tr>
                    )}
                </tbody>
            </table>

            <EditUnitModal
                isOpen={editingUnit !== null}
                onClose={() => setEditingUnit(null)}
                unit={editingUnit}
                onSave={handleUpdateUnit}
            />
        </section>
    );
};

export default ShippedUnitsSection;