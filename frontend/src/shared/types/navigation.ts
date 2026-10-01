export type View =
    | "dashboard"
    | "analysis-dashboard"
    | "rules"
    | "upload"
    | "details"
    | "upload-details"
    | "profile"
    | "card-schemes";

export type NavigationItem = {
    view: View;
    label: string;
    active: boolean;
};
