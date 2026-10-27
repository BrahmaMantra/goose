import React, { type ReactNode } from "react";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import ThemedImage from "@theme/ThemedImage";
import OriginalNavbarLogo from "@theme-original/Navbar/Logo";
import { useGdkNavigation } from "@site/src/components/GdkNavigation";

export default function NavbarLogo(): ReactNode {
  const isGdk = useGdkNavigation();
  const lightLogo = useBaseUrl("/img/logo_light.png");
  const darkLogo = useBaseUrl("/img/logo_dark.png");
  return isGdk ? (
    <Link className="navbar__brand margin-right--md" to="/docs/gdk">
      <ThemedImage
        alt=""
        sources={{ light: lightLogo, dark: darkLogo }}
        width={28}
        height={28}
        className="margin-right--sm"
      />
      <b className="navbar__title">GDK</b>
    </Link>
  ) : (
    <OriginalNavbarLogo />
  );
}
