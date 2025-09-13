# Quality Tracker Application Installation Guide

This guide provides step-by-step instructions to install and run the Quality Tracker application on a Windows PC as a server within your Local Area Network (LAN).

In this setup, the Python (Flask) backend will serve the React frontend, creating a single, unified application.

## Prerequisites

Before you begin, ensure the following software is installed on the server PC:

- **Git:** For cloning the application repository. ([Download Git](https://git-scm.com/))
- **Python 3.10+:** For running the backend. ([Download Python](https://www.python.org/))
- **Node.js and npm:** For building the frontend. ([Download Node.js](https://nodejs.org/))
- **MySQL Server:** The database for the application. ([Download MySQL](https://dev.mysql.com/downloads/installer/))

---

## Step 1: Database Setup

1.  **Create Database and User:**
    -   Log in to your MySQL server.
    -   Create a new database. The recommended name is `quality`.
    -   Create a new user (e.g., `factory_user`) and grant it all privileges on the `quality` database.

2.  **Run Initialization Scripts:**
    -   Open a command prompt or terminal.
    -   Navigate to the root of the project directory.
    -   Run the schema creation script to set up the tables:
        ```sh
        mysql -u YOUR_USERNAME -p quality < backend\schema.sql
        ```
        *(Replace `YOUR_USERNAME` with the user you created. You will be prompted for the password.)*

    -   (Optional) Run the seed script to add sample data:
        ```sh
        mysql -u YOUR_USERNAME -p quality < seed.sql
        ```

---

## Step 2: Backend Setup

1.  **Create Virtual Environment:**
    -   Navigate to the `backend` directory: `cd backend`
    -   Create a Python virtual environment: `python -m venv venv`
    -   Activate it: `venv\Scripts\activate`

2.  **Install Dependencies:**
    -   Install the required Python packages:
        ```sh
        pip install -r requirements.txt
        ```

3.  **Configure Environment:**
    -   In the `backend` directory, create a file named `.env`.
    -   Add the following content, replacing the placeholder values with your actual database credentials and desired secrets.

    ```env
    # Database Connection
    DB_HOST=localhost
    DB_USER=factory_user
    DB_PASSWORD=your_database_password
    DB_NAME=quality

    # Application Security
    JWT_SECRET_KEY=generate_a_long_random_string_here
    CLIENT_ORIGIN_URL=http://YOUR_SERVER_IP:5000
    ```
    *Replace `YOUR_SERVER_IP` with the actual IP address of the PC running the server.*

4.  **Create Admin User:**
    -   From the `backend` directory (with the virtual environment active), run the `create-admin` command. You will be prompted to create a secure password.
        ```sh
        flask create-admin
        ```

---

## Step 3: Frontend Setup

1.  **Install Dependencies:**
    -   Navigate to the `frontend` directory: `cd ..\frontend`
    -   Install the required Node.js packages:
        ```sh
        npm install
        ```

2.  **Configure Environment:**
    -   In the `frontend` directory, create a file named `.env`.
    -   Add the following line, replacing the IP address with the IP of your backend server.

    ```env
    REACT_APP_API_URL=http://YOUR_SERVER_IP:5000/api
    ```

3.  **Build the Frontend:**
    -   Run the build script. This will create a `build` directory containing the optimized, static frontend files.
        ```sh
        npm run build
        ```

4.  **Move Build Files:**
    -   Copy the entire `frontend\build` directory and paste it inside the `backend` directory.

---

## Step 4: Running the Application

For a LAN server, it is highly recommended to run the application as a Windows Service so it starts automatically and runs persistently in the background.

1.  **Download NSSM:**
    -   Download the latest version of **NSSM (the Non-Sucking Service Manager)** from [nssm.cc](https://nssm.cc/).
    -   Place the `nssm.exe` file in a permanent location, like `C:\NSSM\`.

2.  **Install the Service:**
    -   Open a command prompt **as an Administrator**.
    -   Navigate to the NSSM directory: `cd C:\NSSM`
    -   Run the NSSM installer for your app: `nssm install QualityTracker`

3.  **Configure the Service (NSSM GUI):**
    -   **Application Tab:**
        -   **Path:** Browse to the `python.exe` inside your backend's virtual environment. (e.g., `D:\Factory Tracker\Quality-V2\backend\venv\Scripts\python.exe`)
        -   **Startup directory:** Browse to your `backend` folder. (e.g., `D:\Factory Tracker\Quality-V2\backend`)
        -   **Arguments:** Enter `run.py`.
    -   Click **Install service**.

4.  **Open Firewall Port:**
    -   Create an inbound rule in your Windows Firewall to allow incoming TCP traffic on port `5000`.

5.  **Start the Service:**
    -   In the same admin command prompt, run: `nssm start QualityTracker`
    -   You can check its status with `nssm status QualityTracker`.

---

## Step 5: Accessing the Application

-   From any other computer on the same LAN, open a web browser.
-   Navigate to `http://YOUR_SERVER_IP:5000` (using the server's actual IP address).

The Quality Tracker application should now be accessible.
