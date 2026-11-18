import { isOaIconId, OaIcon } from "../icons/oaIcon";

interface RibbonButtonProps {
  /** Een OpenAEC B2-id (zoals "view.fit") of, voor een knop zonder B2-icoon, svg-tekst. */
  icon: string;
  label: string;
  title?: string;
  size?: "large" | "small" | "medium";
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export default function RibbonButton({
  icon,
  label,
  title,
  size = "large",
  active,
  disabled,
  onClick,
}: RibbonButtonProps) {
  return (
    <button
      className={`ribbon-btn${size === "small" ? " small" : ""}${size === "medium" ? " medium" : ""}${active ? " active" : ""}`}
      title={title || label}
      disabled={disabled}
      onClick={onClick}
    >
      {isOaIconId(icon) ? (
        <div className="ribbon-btn-icon"><OaIcon id={icon} size={size === "large" ? 24 : 16} /></div>
      ) : (
        <div className="ribbon-btn-icon" dangerouslySetInnerHTML={{ __html: icon }} />
      )}
      <span className="ribbon-btn-label">{label}</span>
    </button>
  );
}
