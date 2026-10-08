import { useState } from "react";
import { BarChartOutlined } from "@ant-design/icons";
import { Button, Modal } from "antd";
import { UploadComparisonPanel } from "./UploadComparisonPanel";

export function UploadComparisonModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [contentKey, setContentKey] = useState(0);

    const openModal = () => {
        setContentKey((key) => key + 1);
        setIsOpen(true);
    };

    return (
        <>
            <Button
                size="large"
                className="standard-action-size"
                icon={<BarChartOutlined />}
                onClick={openModal}
            >
                Compare CSVs
            </Button>
            <Modal
                open={isOpen}
                centered
                width={1000}
                className="analysis-comparison-modal"
                title={null}
                onCancel={() => setIsOpen(false)}
                footer={[
                    <Button key="close" onClick={() => setIsOpen(false)}>
                        Close
                    </Button>
                ]}
                destroyOnHidden
            >
                <UploadComparisonPanel key={contentKey} />
            </Modal>
        </>
    );
}
