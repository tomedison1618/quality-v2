import React, { useState, useEffect } from 'react';

const MultiReasonSelect = ({ value, onChange }) => {
    const predefinedReasons = ['tuning', 'defective components', 'changing design'];

    // Internal state for managing the UI elements
    const [selected, setSelected] = useState(new Set());
    const [otherText, setOtherText] = useState('');
    const [isOtherChecked, setIsOtherChecked] = useState(false);

    // This effect runs ONLY when the initial 'value' prop from the parent changes.
    // It is responsible for parsing the initial string (e.g., when editing a unit).
    useEffect(() => {
        const reasons = value ? value.split(',').map(r => r.trim()) : [];
        const newSelected = new Set();
        let currentOtherText = '';
        let currentIsOtherChecked = false;

        reasons.forEach(reason => {
            if (predefinedReasons.includes(reason)) {
                newSelected.add(reason);
            } else if (reason) {
                currentIsOtherChecked = true;
                currentOtherText = reason;
            }
        });

        setSelected(newSelected);
        setIsOtherChecked(currentIsOtherChecked);
        setOtherText(currentOtherText);
    }, [value]); // Dependency is ONLY the initial value prop

    // Helper function to calculate the final string and notify the parent
    const sendUpdate = (updatedSelected, updatedIsOther, updatedOtherText) => {
        const reasonsArray = [...updatedSelected];
        if (updatedIsOther && updatedOtherText.trim()) {
            reasonsArray.push(updatedOtherText.trim());
        }
        onChange(reasonsArray.join(', '));
    };

    const handleCheckboxChange = (reason) => {
        const newSelected = new Set(selected);
        if (newSelected.has(reason)) {
            newSelected.delete(reason);
        } else {
            newSelected.add(reason);
        }
        setSelected(newSelected); // Update internal state
        sendUpdate(newSelected, isOtherChecked, otherText); // Notify parent
    };

    const handleOtherCheckboxChange = () => {
        const newIsOther = !isOtherChecked;
        setIsOtherChecked(newIsOther); // Update internal state
        sendUpdate(selected, newIsOther, otherText); // Notify parent
    };

    const handleOtherTextChange = (e) => {
        const newOtherText = e.target.value;
        setOtherText(newOtherText); // Update internal state
        sendUpdate(selected, isOtherChecked, newOtherText); // Notify parent
    };


    return (
        <div className="multi-reason-container">
            <label className="retest-label">Reason(s) for Retest:</label>
            <div className="reason-options">
                {predefinedReasons.map(reason => (
                    <label key={reason} className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={selected.has(reason)}
                            onChange={() => handleCheckboxChange(reason)}
                        />
                        {reason.charAt(0).toUpperCase() + reason.slice(1)}
                    </label>
                ))}
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={isOtherChecked}
                        onChange={handleOtherCheckboxChange}
                    />
                    Others
                </label>
            </div>
            {isOtherChecked && (
                <input
                    type="text"
                    className="other-reason-input"
                    placeholder="Please specify other reason"
                    value={otherText}
                    onChange={handleOtherTextChange}
                />
            )}
        </div>
    );
};

export default MultiReasonSelect;