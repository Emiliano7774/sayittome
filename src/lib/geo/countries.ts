import { ARGENTINA_PROVINCIAS } from "@/lib/profile/provincias";

export type GeoCountry = {
  code: string;
  name: string;
  subdivisionLabel: string;
  subdivisions: readonly string[];
};

export const SHUFFLE_COUNTRIES: readonly GeoCountry[] = [
  {
    code: "AR",
    name: "Argentina",
    subdivisionLabel: "Provincia",
    subdivisions: ARGENTINA_PROVINCIAS,
  },
  {
    code: "US",
    name: "Estados Unidos",
    subdivisionLabel: "Estado",
    subdivisions: [
      "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
      "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
      "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
      "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
      "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina",
      "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
      "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
      "Virginia", "Washington", "Washington D.C.", "West Virginia", "Wisconsin", "Wyoming",
    ],
  },
  {
    code: "IT",
    name: "Italia",
    subdivisionLabel: "Región / Provincia",
    subdivisions: [
      "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
      "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", "Molise",
      "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino-Alto Adige",
      "Umbria", "Valle d'Aosta", "Veneto",
    ],
  },
  {
    code: "DE",
    name: "Alemania",
    subdivisionLabel: "Estado federado",
    subdivisions: [
      "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg",
      "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen",
      "Rheinland-Pfalz", "Saarland", "Sachsen", "Sachsen-Anhalt", "Schleswig-Holstein",
      "Thüringen",
    ],
  },
  {
    code: "ES",
    name: "España",
    subdivisionLabel: "Comunidad autónoma",
    subdivisions: [
      "Andalucía", "Aragón", "Asturias", "Baleares", "Canarias", "Cantabria",
      "Castilla-La Mancha", "Castilla y León", "Cataluña", "Ceuta", "Comunidad Valenciana",
      "Extremadura", "Galicia", "La Rioja", "Madrid", "Melilla", "Murcia", "Navarra",
      "País Vasco",
    ],
  },
  {
    code: "MX",
    name: "México",
    subdivisionLabel: "Estado",
    subdivisions: [
      "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
      "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México",
      "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit",
      "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
      "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán",
      "Zacatecas",
    ],
  },
  {
    code: "BR",
    name: "Brasil",
    subdivisionLabel: "Estado",
    subdivisions: [
      "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
      "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
      "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro",
      "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina",
      "São Paulo", "Sergipe", "Tocantins",
    ],
  },
  {
    code: "CO",
    name: "Colombia",
    subdivisionLabel: "Departamento",
    subdivisions: [
      "Amazonas", "Antioquia", "Arauca", "Atlántico", "Bolívar", "Boyacá", "Caldas",
      "Caquetá", "Casanare", "Cauca", "Cesar", "Chocó", "Córdoba", "Cundinamarca",
      "Guainía", "Guaviare", "Huila", "La Guajira", "Magdalena", "Meta", "Nariño",
      "Norte de Santander", "Putumayo", "Quindío", "Risaralda", "San Andrés y Providencia",
      "Santander", "Sucre", "Tolima", "Valle del Cauca", "Vaupés", "Vichada",
    ],
  },
  {
    code: "CL",
    name: "Chile",
    subdivisionLabel: "Región",
    subdivisions: [
      "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo", "Valparaíso",
      "Metropolitana de Santiago", "O'Higgins", "Maule", "Ñuble", "Biobío", "Araucanía",
      "Los Ríos", "Los Lagos", "Aysén", "Magallanes",
    ],
  },
  {
    code: "PE",
    name: "Perú",
    subdivisionLabel: "Departamento",
    subdivisions: [
      "Amazonas", "Áncash", "Apurímac", "Arequipa", "Ayacucho", "Cajamarca", "Callao",
      "Cusco", "Huancavelica", "Huánuco", "Ica", "Junín", "La Libertad", "Lambayeque",
      "Lima", "Loreto", "Madre de Dios", "Moquegua", "Pasco", "Piura", "Puno",
      "San Martín", "Tacna", "Tumbes", "Ucayali",
    ],
  },
  {
    code: "UY",
    name: "Uruguay",
    subdivisionLabel: "Departamento",
    subdivisions: [
      "Artigas", "Canelones", "Cerro Largo", "Colonia", "Durazno", "Flores", "Florida",
      "Lavalleja", "Maldonado", "Montevideo", "Paysandú", "Río Negro", "Rivera", "Rocha",
      "Salto", "San José", "Soriano", "Tacuarembó", "Treinta y Tres",
    ],
  },
  {
    code: "PY",
    name: "Paraguay",
    subdivisionLabel: "Departamento",
    subdivisions: [
      "Alto Paraguay", "Alto Paraná", "Amambay", "Asunción", "Boquerón", "Caaguazú",
      "Caazapá", "Canindeyú", "Central", "Concepción", "Cordillera", "Guairá", "Itapúa",
      "Misiones", "Ñeembucú", "Paraguarí", "Presidente Hayes", "San Pedro",
    ],
  },
  {
    code: "FR",
    name: "Francia",
    subdivisionLabel: "Región",
    subdivisions: [
      "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne", "Centre-Val de Loire",
      "Corse", "Grand Est", "Hauts-de-France", "Île-de-France", "Normandie",
      "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire", "Provence-Alpes-Côte d'Azur",
    ],
  },
  {
    code: "GB",
    name: "Reino Unido",
    subdivisionLabel: "Nación / Región",
    subdivisions: ["Inglaterra", "Escocia", "Gales", "Irlanda del Norte"],
  },
  {
    code: "CA",
    name: "Canadá",
    subdivisionLabel: "Provincia / Territorio",
    subdivisions: [
      "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador",
      "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan",
      "Northwest Territories", "Nunavut", "Yukon",
    ],
  },
  {
    code: "PT",
    name: "Portugal",
    subdivisionLabel: "Distrito / Región",
    subdivisions: [
      "Aveiro", "Beja", "Braga", "Bragança", "Castelo Branco", "Coimbra", "Évora", "Faro",
      "Guarda", "Leiria", "Lisboa", "Portalegre", "Porto", "Santarém", "Setúbal",
      "Viana do Castelo", "Vila Real", "Viseu", "Açores", "Madeira",
    ],
  },
  {
    code: "VE",
    name: "Venezuela",
    subdivisionLabel: "Estado",
    subdivisions: [
      "Amazonas", "Anzoátegui", "Apure", "Aragua", "Barinas", "Bolívar", "Carabobo",
      "Cojedes", "Delta Amacuro", "Distrito Capital", "Falcón", "Guárico", "Lara", "Mérida",
      "Miranda", "Monagas", "Nueva Esparta", "Portuguesa", "Sucre", "Táchira", "Trujillo",
      "Vargas", "Yaracuy", "Zulia",
    ],
  },
  {
    code: "EC",
    name: "Ecuador",
    subdivisionLabel: "Provincia",
    subdivisions: [
      "Azuay", "Bolívar", "Cañar", "Carchi", "Chimborazo", "Cotopaxi", "El Oro", "Esmeraldas",
      "Galápagos", "Guayas", "Imbabura", "Loja", "Los Ríos", "Manabí", "Morona Santiago",
      "Napo", "Orellana", "Pastaza", "Pichincha", "Santa Elena", "Santo Domingo",
      "Sucumbíos", "Tungurahua", "Zamora Chinchipe",
    ],
  },
  {
    code: "BO",
    name: "Bolivia",
    subdivisionLabel: "Departamento",
    subdivisions: [
      "Beni", "Chuquisaca", "Cochabamba", "La Paz", "Oruro", "Pando", "Potosí",
      "Santa Cruz", "Tarija",
    ],
  },
  {
    code: "CR",
    name: "Costa Rica",
    subdivisionLabel: "Provincia",
    subdivisions: [
      "San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón",
    ],
  },
  {
    code: "PA",
    name: "Panamá",
    subdivisionLabel: "Provincia",
    subdivisions: [
      "Bocas del Toro", "Coclé", "Colón", "Chiriquí", "Darién", "Herrera", "Los Santos",
      "Panamá", "Panamá Oeste", "Veraguas", "Guna Yala", "Emberá-Wounaan", "Ngäbe-Buglé",
    ],
  },
  {
    code: "DO",
    name: "República Dominicana",
    subdivisionLabel: "Provincia",
    subdivisions: [
      "Azua", "Baoruco", "Barahona", "Dajabón", "Distrito Nacional", "Duarte", "El Seibo",
      "Espaillat", "Hato Mayor", "Hermanas Mirabal", "Independencia", "La Altagracia",
      "La Romana", "La Vega", "María Trinidad Sánchez", "Monseñor Nouel", "Monte Cristi",
      "Monte Plata", "Pedernales", "Peravia", "Puerto Plata", "Samaná", "San Cristóbal",
      "San José de Ocoa", "San Juan", "San Pedro de Macorís", "Sánchez Ramírez", "Santiago",
      "Santiago Rodríguez", "Santo Domingo", "Valverde",
    ],
  },
  {
    code: "AU",
    name: "Australia",
    subdivisionLabel: "Estado / Territorio",
    subdivisions: [
      "New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia",
      "Tasmania", "Australian Capital Territory", "Northern Territory",
    ],
  },
] as const;

const countryByCode = new Map(SHUFFLE_COUNTRIES.map((country) => [country.code, country]));

const subdivisionIndex = new Map<string, string>();

for (const country of SHUFFLE_COUNTRIES) {
  for (const subdivision of country.subdivisions) {
    subdivisionIndex.set(normalizeGeoValue(subdivision), country.code);
  }
}

export function normalizeGeoValue(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function getCountryByCode(code: string) {
  return countryByCode.get(String(code || "").trim().toUpperCase()) || null;
}

export function getSubdivisionsForCountry(code: string) {
  return getCountryByCode(code)?.subdivisions ?? [];
}

export function inferCountryCodeFromSubdivision(subdivision: string) {
  return subdivisionIndex.get(normalizeGeoValue(subdivision)) || "";
}

export function resolveProfileCountryCode(profile: { pais?: string; provincia?: string }) {
  const explicit = String(profile.pais || "").trim().toUpperCase();
  if (explicit && countryByCode.has(explicit)) return explicit;

  const inferred = inferCountryCodeFromSubdivision(String(profile.provincia || ""));
  if (inferred) return inferred;

  return "";
}

export function resolveProfileCountryName(profile: { pais?: string; provincia?: string }) {
  const code = resolveProfileCountryCode(profile);
  return code ? getCountryByCode(code)?.name || "" : "";
}
