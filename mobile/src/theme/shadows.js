import { colors } from './colors';

/**
 * Two elevations, deliberately. Shadows are tinted with the brand blue so
 * lifted surfaces read as warm depth rather than grey haze.
 */
export const shadows = {
  soft: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  lifted: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
};
