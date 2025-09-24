import { randomUUID } from 'crypto';

/**
 * Build a minimal OID4VP-compatible Authorization Request (JAR-less) with
 * Presentation Exchange and a DCQL-like credentialQuery. This is a simplified
 * example intended for demo purposes.
 */
export function createOid4vpRequest() {
  const state = randomUUID();
  const nonce = randomUUID();

  // Presentation Exchange v2.0.0 submission requirements and input descriptors
  const presentationDefinition = {
    id: `pd-${state}`,
    format: {
      "jwt_vc": { alg: ["ES256", "ES256K", "EdDSA"] },
      "jwt_vp": { alg: ["ES256", "ES256K", "EdDSA"] }
    },
    input_descriptors: [
      {
        id: "university-degree",
        name: "University Degree Credential",
        purpose: "Prove you hold a university degree issued by the issuer.",
        constraints: {
          fields: [
            {
              path: [
                "$.credentialSubject.degree.type",
                "$.vc.credentialSubject.degree.type"
              ],
              filter: { type: "string", const: "BachelorDegree" }
            }
          ]
        }
      }
    ]
  };

  // DCQL-like query (W3C Draft) — structure may evolve; treated as opaque blob
  const dcqlQuery = {
    query: [
      {
        type: "DCQLQuery",
        credentialQuery: [
          {
            reason: "Proof of degree for metaverse campus access",
            acceptedFormats: ["jwt_vc", "ldp_vc"],
            filter: {
              type: ["VerifiableCredential", "UniversityDegreeCredential"],
              credentialSubject: {
                degree: { type: { const: "BachelorDegree" } }
              }
            }
          }
        ]
      }
    ]
  };

  // OID4VP authorization request members (simplified)
  const authorizationRequest = {
    response_type: "vp_token",
    client_id: "https://metaverse.example.com/verifier",
    redirect_uri: "https://metaverse.example.com/callback",
    scope: "openid",
    state,
    nonce,
    presentation_definition: presentationDefinition,
    claims: dcqlQuery
  };

  return authorizationRequest;
}


