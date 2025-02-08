export const authorizeHTML = ({
	scopes,
	clientIcon,
	clientName,
	redirectURI,
	cancelURI,
}: {
	scopes: string[];
	clientIcon?: string;
	clientName: string;
	redirectURI: string;
	cancelURI: string;
	clientMetadata?: Record<string, any>;
}) => `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta clientName="viewport" content="width=device-width, initial-scale=1.0">
      <title>Authorize Application</title>
      <style>
          :root {
              --bg-color: #000000;
              --card-color: #1a1a1a;
              --text-primary: #ffffff;
              --text-secondary: #b0b0b0;
              --border-color: #333333;
              --button-color: #ffffff;
              --button-text: #000000;
          }
          body {
              font-family: 'Inter', 'Helvetica', 'Arial', sans-serif;
              background-color: var(--bg-color);
              color: var(--text-primary);
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
              box-sizing: border-box;
          }
          .authorize-container {
              background-color: var(--card-color);
              border: 1px solid var(--border-color);
              padding: 32px;
              width: 100%;
              max-width: 420px;
              box-shadow: 0 8px 24px rgba(255,255,255,0.1);
          }
          .app-info {
              display: flex;
              align-items: center;
              margin-bottom: 24px;
          }
          .app-clientIcon {
              width: 64px;
              height: 64px;
              margin-right: 16px;
              object-fit: cover;
          }
          .app-clientName {
              font-size: 24px;
              font-weight: 700;
          }
          .permissions-list {
              background-color: rgba(255, 255, 255, 0.05);
              border: 1px solid var(--border-color);
              padding: 16px;
              margin-bottom: 24px;
          }
          .permissions-list h3 {
              margin-top: 0;
              font-size: 16px;
              color: var(--text-secondary);
              margin-bottom: 12px;
          }
          .permissions-list ul {
              list-style-type: none;
              padding: 0;
              margin: 0;
          }
          .permissions-list li {
              margin-bottom: 8px;
              display: flex;
              align-items: center;
          }
          .permissions-list li::before {
              content: "•";
              color: var(--text-primary);
              font-size: 18px;
              margin-right: 8px;
          }
          .buttons {
              display: flex;
              justify-content: flex-end;
              gap: 12px;
          }
          .button {
              padding: 10px 20px;
              border: none;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s ease;
          }
          .authorize {
              background-color: var(--button-color);
              color: var(--button-text);
          }
          .authorize:hover {
              opacity: 0.9;
          }
          .cancel {
              background-color: transparent;
              color: var(--text-secondary);
              border: 1px solid var(--text-secondary);
          }
          .cancel:hover {
              background-color: rgba(255, 255, 255, 0.1);
          }
      </style>
  </head>
  <body>
      <div class="authorize-container">
          <div class="app-info">
              <img src="${clientIcon || ""}" alt="${clientName} clientIcon" class="app-clientIcon">
              <span class="app-clientName">${clientName}</span>
          </div>
          <p>${clientName} would like permission to access your account</p>
          <div class="permissions-list">
              <h3>This will allow ${clientName} to:</h3>
              <ul>
                  ${scopes.map((scope) => `<li>${scope}</li>`).join("")}
              </ul>
          </div>
          <div class="buttons">
                <a href="${cancelURI}" class="button cancel">Cancel</a>
               <a href="${redirectURI}" class="button authorize">Authorize</a>
          </div>
      </div>
  </body>
  </html>`;
