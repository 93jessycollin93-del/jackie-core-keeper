import { useTranslation } from "react-i18next";
import { LANGUAGES } from "@/i18n";
import { Globe } from "lucide-react";

export const LanguageSelector = () => {
  const { i18n } = useTranslation();

  return (
    <div className="flex items-center gap-1.5">
      <Globe size={12} className="text-muted-foreground" />
      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className="bg-transparent border-none font-mono text-[10px] text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
};
